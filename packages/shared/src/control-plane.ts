import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "./db.js";

const dbAny = db as any;

const CP_PROJECT_STATUS = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  ARCHIVED: "ARCHIVED",
} as const;

type CpProjectStatusValue = (typeof CP_PROJECT_STATUS)[keyof typeof CP_PROJECT_STATUS];

const CP_DOC_KIND = {
  PROJECT: "PROJECT",
  ACTION_PLAN: "ACTION_PLAN",
  NOTES: "NOTES",
  ARCHITECTURE: "ARCHITECTURE",
  DECISIONS: "DECISIONS",
  STATUS: "STATUS",
  RUNBOOK: "RUNBOOK",
} as const;

type CpDocKindValue = (typeof CP_DOC_KIND)[keyof typeof CP_DOC_KIND];

const CP_DOC_MODE = {
  MANAGED: "MANAGED",
  FROZEN: "FROZEN",
  EXTERNAL_IMPORT: "EXTERNAL_IMPORT",
} as const;

type CpDocModeValue = (typeof CP_DOC_MODE)[keyof typeof CP_DOC_MODE];

const CP_TRUST_MODE = {
  STRICT: "STRICT",
  BALANCED: "BALANCED",
  TRUSTED: "TRUSTED",
} as const;

type CpTrustModeValue = (typeof CP_TRUST_MODE)[keyof typeof CP_TRUST_MODE];

const CP_PHASE_STATUS = {
  PLANNING: "PLANNING",
  READY: "READY",
  ACTIVE: "ACTIVE",
  BLOCKED: "BLOCKED",
  DONE: "DONE",
  ARCHIVED: "ARCHIVED",
} as const;

type CpPhaseStatusValue = (typeof CP_PHASE_STATUS)[keyof typeof CP_PHASE_STATUS];

const CP_WORK_ITEM_TYPE = {
  PLANNING: "PLANNING",
  EXECUTION: "EXECUTION",
  AUDIT: "AUDIT",
  REVIEW: "REVIEW",
  APPROVAL: "APPROVAL",
} as const;

type CpWorkItemTypeValue = (typeof CP_WORK_ITEM_TYPE)[keyof typeof CP_WORK_ITEM_TYPE];

const CP_WORK_ITEM_STATUS = {
  PLANNING: "PLANNING",
  READY: "READY",
  BLOCKED: "BLOCKED",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  ARCHIVED: "ARCHIVED",
} as const;

type CpWorkItemStatusValue = (typeof CP_WORK_ITEM_STATUS)[keyof typeof CP_WORK_ITEM_STATUS];

const CP_AUTONOMY_LEVEL = {
  MANUAL: "MANUAL",
  DRAFT_ONLY: "DRAFT_ONLY",
  APPROVAL_GATED: "APPROVAL_GATED",
  TRUSTED_AUTO: "TRUSTED_AUTO",
} as const;

type CpAutonomyLevelValue = (typeof CP_AUTONOMY_LEVEL)[keyof typeof CP_AUTONOMY_LEVEL];

const CP_RISK_LEVEL = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;

type CpRiskLevelValue = (typeof CP_RISK_LEVEL)[keyof typeof CP_RISK_LEVEL];

export type CreateCpProjectInput = {
  slug: string;
  title: string;
  owner?: string | null;
  status?: CpProjectStatusValue;
  defaultTrustMode?: CpTrustModeValue;
  docMode?: CpDocModeValue;
  summary?: string | null;
  idea?: string | null;
};

export type UpdateCpProjectInput = Partial<Omit<CreateCpProjectInput, "slug">>;

export type CreateCpProjectDocInput = {
  projectId: string;
  kind: CpDocKindValue;
  title: string;
  contentMarkdown: string;
  editedBy?: string | null;
  editReason?: string | null;
};

export type UpdateCpProjectDocInput = {
  version: number;
  title?: string;
  contentMarkdown?: string;
  editedBy?: string | null;
  editReason?: string | null;
};

export type CreateCpPhaseInput = {
  projectId: string;
  phaseKey: string;
  title: string;
  ordinal: number;
  planningRequired?: boolean;
  status?: CpPhaseStatusValue;
  entryCriteriaMarkdown?: string | null;
  exitCriteriaMarkdown?: string | null;
  summaryMarkdown?: string | null;
};

export type UpdateCpPhaseInput = Partial<Omit<CreateCpPhaseInput, "projectId" | "phaseKey" | "ordinal">>;

export type CreateCpWorkItemInput = {
  projectId: string;
  phaseId?: string | null;
  type: CpWorkItemTypeValue;
  title: string;
  descriptionMarkdown?: string | null;
  status?: CpWorkItemStatusValue;
  autonomyLevel?: CpAutonomyLevelValue;
  riskLevel?: CpRiskLevelValue;
  dataClass?: string | null;
  assignedAgentKey?: string | null;
  autonomousEligible?: boolean;
  priority?: number | null;
  recommendedCapabilities?: string[] | null;
  recommendedSkills?: string[] | null;
  recommendedTools?: string[] | null;
};

export type UpdateCpWorkItemInput = Partial<Omit<CreateCpWorkItemInput, "projectId" | "type" | "title">> & {
  title?: string;
};

export type CreateCpDependencyInput = {
  fromSubjectType: string;
  fromSubjectId: string;
  toSubjectType: string;
  toSubjectId: string;
  edgeType: string;
  scope: string;
  strength?: string;
  reason?: string | null;
  createdBy?: string | null;
};

function dependencyWouldCreateCycle(existingEdges: Array<{ fromSubjectId: string; toSubjectId: string }>, fromSubjectId: string, toSubjectId: string) {
  const graph = new Map<string, string[]>();
  for (const edge of existingEdges) {
    const list = graph.get(edge.fromSubjectId) ?? [];
    list.push(edge.toSubjectId);
    graph.set(edge.fromSubjectId, list);
  }

  const visited = new Set<string>();
  const stack = [toSubjectId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (current === fromSubjectId) return true;
    for (const next of graph.get(current) ?? []) stack.push(next);
  }
  return false;
}

function extractMarkdownHeadings(content: string) {
  return content
    .split("\n")
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, "").trim())
    .filter(Boolean);
}

function extractAcceptanceCriteria(content: string) {
  const lines = content.split("\n");
  const results: string[] = [];
  let capture = false;
  for (const line of lines) {
    if (/^#{1,6}\s+acceptance criteria/i.test(line.trim())) {
      capture = true;
      continue;
    }
    if (capture && /^#{1,6}\s+/.test(line.trim())) break;
    if (capture && /^[-*]\s+/.test(line.trim())) {
      results.push(line.replace(/^[-*]\s+/, "").trim());
    }
  }
  return results;
}

function extractTaskCandidates(content: string) {
  return content
    .split("\n")
    .filter((line) => /^- \[(?: |x|X)\]\s+/.test(line))
    .map((line) => ({
      text: line.replace(/^- \[(?: |x|X)\]\s+/, "").trim(),
      done: /^- \[(?:x|X)\]\s+/.test(line),
    }))
    .filter((item) => item.text.length > 0);
}

function slugifyPathPart(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function snapshotHeader() {
  return "<!-- EXPORTED READ-ONLY SNAPSHOT: NOT CANONICAL. DO NOT EDIT. DO NOT USE AS ACTIVE WORKING SOURCE. -->\n\n";
}

async function writeControlPlaneExport(snapshot: any) {
  const basePath = snapshot.outputPath;
  await mkdir(basePath, { recursive: true });

  const projects = await dbAny.cpProject.findMany({
    where: snapshot.projectId ? { id: snapshot.projectId } : { archivedAt: null },
    include: {
      docs: {
        where: { isActive: true, archivedAt: null },
        orderBy: { kind: "asc" },
      },
      phases: {
        where: { archivedAt: null },
        orderBy: { ordinal: "asc" },
      },
      workItems: {
        where: { archivedAt: null },
        orderBy: [{ phaseId: "asc" }, { createdAt: "asc" }],
      },
      realityAudits: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { findings: true },
      },
    },
  });

  const manifest = {
    snapshotId: snapshot.id,
    createdAt: snapshot.createdAt,
    projectId: snapshot.projectId,
    outputPath: snapshot.outputPath,
    projects: projects.map((project: any) => ({
      id: project.id,
      slug: project.slug,
      title: project.title,
      docs: project.docs.length,
      phases: project.phases.length,
      workItems: project.workItems.length,
      audits: project.realityAudits.length,
    })),
  };

  await writeFile(
    path.join(basePath, "README.md"),
    `${snapshotHeader()}# Export Snapshot\n\nThis directory is archival output from Houston's project control plane.\n\n- It is not canonical.\n- It is read-only by convention.\n- Agents and automation should not treat it as active working state.\n`
  );

  const manifestPayload = {
    ...manifest,
    manifestHash: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
  };
  await writeFile(path.join(basePath, "manifest.json"), JSON.stringify(manifestPayload, null, 2));

  for (const project of projects) {
    const projectDir = path.join(basePath, slugifyPathPart(project.slug));
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "PROJECT-INFO.md"),
      `${snapshotHeader()}# ${project.title}\n\n- Slug: ${project.slug}\n- Status: ${project.status}\n- Trust Mode: ${project.defaultTrustMode}\n- Doc Mode: ${project.docMode}\n\n${project.summary ? `${project.summary}\n` : ""}`
    );

    for (const doc of project.docs) {
      await writeFile(
        path.join(projectDir, `${doc.kind}.md`),
        `${snapshotHeader()}${doc.contentMarkdown}`
      );
    }

    const phasesMarkdown = project.phases
      .map((phase: any) => `## ${phase.title}\n\n- Key: ${phase.phaseKey}\n- Status: ${phase.status}\n- Planning Required: ${phase.planningRequired ? "yes" : "no"}`)
      .join("\n\n");
    await writeFile(path.join(projectDir, "PHASES.md"), `${snapshotHeader()}# Phases\n\n${phasesMarkdown}\n`);

    const workItemsMarkdown = project.workItems
      .map((item: any) => `## ${item.title}\n\n- Type: ${item.type}\n- Status: ${item.status}\n- Phase: ${item.phaseId ?? "none"}\n${item.descriptionMarkdown ? `\n${item.descriptionMarkdown}` : ""}`)
      .join("\n\n");
    await writeFile(path.join(projectDir, "WORK-ITEMS.md"), `${snapshotHeader()}# Work Items\n\n${workItemsMarkdown}\n`);

    const auditsMarkdown = project.realityAudits
      .map((audit: any) => `## Audit ${audit.id}\n\n- Status: ${audit.status}\n- Findings: ${audit.findings.length}`)
      .join("\n\n");
    await writeFile(path.join(projectDir, "AUDITS.md"), `${snapshotHeader()}# Audits\n\n${auditsMarkdown || "No audits exported."}\n`);
  }
}

export type CreateCpApprovalRequestInput = {
  domain: string;
  subjectType: string;
  subjectId: string;
  trigger: string;
  reason: string;
  requiredRole?: string | null;
  requestedByRunId?: string | null;
  requestedByActor?: string | null;
  metadata?: unknown;
};

export type DecideCpApprovalRequestInput = {
  approvalRequestId: string;
  decision: string;
  decisionMode: string;
  decidedBy?: string | null;
  reason?: string | null;
  metadata?: unknown;
  bindingType?: string | null;
};

export type CreateCpExecutionRunInput = {
  workItemId: string;
  reason?: string | null;
};

export type CreateCpApprovalPolicyInput = {
  domain: string;
  subjectType?: string | null;
  projectId?: string | null;
  phaseId?: string | null;
  workItemType?: string | null;
  autonomyLevel?: string | null;
  riskLevel?: string | null;
  dataClass?: string | null;
  capabilityKey?: string | null;
  decisionRule: string;
  requiresRole?: string | null;
  priority?: number | null;
  ruleJson?: unknown;
};

export type UpdateCpApprovalPolicyInput = {
  subjectType?: string | null;
  projectId?: string | null;
  phaseId?: string | null;
  workItemType?: string | null;
  autonomyLevel?: string | null;
  riskLevel?: string | null;
  dataClass?: string | null;
  capabilityKey?: string | null;
  decisionRule?: string | null;
  requiresRole?: string | null;
  priority?: number | null;
  ruleJson?: unknown;
  isActive?: boolean | null;
};

export type CreateCpRealityAuditInput = {
  projectId: string;
  sourceType: string;
  confidenceMode: string;
  summary?: string | null;
};

export type CreateCpImportBatchInput = {
  projectId?: string | null;
  sourceType: string;
  sourceRef: string;
  sourceHash?: string | null;
  summary?: string | null;
  metadata?: unknown;
};

export type CreateCpExportSnapshotInput = {
  projectId?: string | null;
  triggerType: string;
  requestedBy?: string | null;
};

const projectInclude = {
  settings: true,
  phases: {
    where: { archivedAt: null },
    orderBy: { ordinal: "asc" as const },
  },
  _count: {
    select: {
      docs: true,
      phases: true,
      workItems: true,
      realityAudits: true,
    },
  },
};

async function emitCpSystemEvent(input: {
  streamType: string;
  subjectType: string;
  subjectId: string;
  eventName: string;
  payload?: unknown;
  actor?: string | null;
}) {
  return dbAny.cpSystemEvent.create({
    data: {
      streamType: input.streamType.toUpperCase(),
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      eventName: input.eventName,
      payload: (input.payload as any) ?? null,
      actor: input.actor ?? null,
    },
  });
}

function applyPauseReadiness<T extends { project?: { status?: string | null; metadata?: unknown } | null; status?: string | null; blockedReasonCache?: unknown }>(item: T): T {
  if (!item.project || item.project.status !== CP_PROJECT_STATUS.PAUSED) return item;
  if (item.status === CP_WORK_ITEM_STATUS.DONE || item.status === CP_WORK_ITEM_STATUS.ARCHIVED) return item;

  const metadata = item.project.metadata && typeof item.project.metadata === "object" && !Array.isArray(item.project.metadata)
    ? (item.project.metadata as Record<string, unknown>)
    : {};

  return {
    ...item,
    status: CP_WORK_ITEM_STATUS.BLOCKED,
    blockedReasonCache: {
      type: "PROJECT_PAUSED",
      message: "Upstream project is paused",
      pausedReason: typeof metadata.pausedReason === "string" ? metadata.pausedReason : null,
      pausedAt: typeof metadata.pausedAt === "string" ? metadata.pausedAt : null,
    },
  };
}

export async function listCpProjects() {
  return dbAny.cpProject.findMany({
    where: { archivedAt: null },
    include: projectInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getCpProjectSummaryCounts() {
  const [projects, workItems] = await Promise.all([
    listCpProjects(),
    dbAny.cpWorkItem.findMany({
      where: { archivedAt: null },
      select: { projectId: true, status: true },
    }),
  ]);

  const counts = new Map<string, Record<string, number>>();
  for (const item of workItems) {
    const current = counts.get(item.projectId) ?? {};
    current[item.status] = (current[item.status] ?? 0) + 1;
    counts.set(item.projectId, current);
  }

  return projects.map((project: any) => ({
    ...project,
    workItemStatusCounts: counts.get(project.id) ?? {},
  }));
}

export async function createCpProject(input: CreateCpProjectInput) {
  const created = await dbAny.cpProject.create({
    data: {
      slug: input.slug,
      title: input.title,
      owner: input.owner ?? null,
      status: input.status ?? CP_PROJECT_STATUS.DRAFT,
      defaultTrustMode: input.defaultTrustMode ?? CP_TRUST_MODE.STRICT,
      docMode: input.docMode ?? CP_DOC_MODE.MANAGED,
      summary: input.summary ?? null,
      settings: { create: {} },
      docs: input.idea
        ? {
            create: {
              kind: CP_DOC_KIND.PROJECT,
              title: input.title,
              contentMarkdown: `# ${input.title}\n\n## Idea\n\n${input.idea.trim()}`,
              version: 1,
            },
          }
        : undefined,
    },
    include: projectInclude,
  });
  await emitCpSystemEvent({
    streamType: "PROJECT",
    subjectType: "PROJECT",
    subjectId: created.id,
    eventName: "project.created",
    payload: { status: created.status, slug: created.slug },
  });
  return created;
}

export async function getCpProject(id: string) {
  return dbAny.cpProject.findUnique({
    where: { id },
    include: {
      ...projectInclude,
      docs: {
        where: { archivedAt: null, isActive: true },
        orderBy: { kind: "asc" },
      },
    },
  });
}

export async function getCpProjectBySlug(slug: string) {
  return dbAny.cpProject.findUnique({
    where: { slug },
    include: {
      ...projectInclude,
      docs: {
        where: { archivedAt: null, isActive: true },
        orderBy: { kind: "asc" },
      },
      workItems: {
        where: { archivedAt: null },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 100,
      },
    },
  });
}

export async function updateCpProject(id: string, input: UpdateCpProjectInput) {
  const updated = await dbAny.cpProject.update({
    where: { id },
    data: {
      title: input.title,
      owner: input.owner,
      status: input.status,
      defaultTrustMode: input.defaultTrustMode,
      docMode: input.docMode,
      summary: input.summary,
    },
    include: projectInclude,
  });
  await emitCpSystemEvent({
    streamType: "PROJECT",
    subjectType: "PROJECT",
    subjectId: updated.id,
    eventName: "project.updated",
    payload: { status: updated.status },
  });
  return updated;
}

export async function pauseCpProject(id: string, reason?: string | null) {
  const existing = await dbAny.cpProject.findUnique({ where: { id } });
  if (!existing) return null;

  const metadata = existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
    ? { ...existing.metadata }
    : {};
  metadata.pausedAt = new Date().toISOString();
  metadata.pausedReason = reason ?? null;

  const updated = await dbAny.cpProject.update({
    where: { id },
    data: {
      status: CP_PROJECT_STATUS.PAUSED,
      metadata,
    },
    include: projectInclude,
  });
  await emitCpSystemEvent({
    streamType: "PROJECT",
    subjectType: "PROJECT",
    subjectId: updated.id,
    eventName: "project.paused",
    payload: { reason: reason ?? null },
  });
  return updated;
}

export async function resumeCpProject(id: string) {
  const existing = await dbAny.cpProject.findUnique({ where: { id } });
  if (!existing) return null;

  const metadata = existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
    ? { ...existing.metadata }
    : {};
  metadata.resumedAt = new Date().toISOString();

  const updated = await dbAny.cpProject.update({
    where: { id },
    data: {
      status: CP_PROJECT_STATUS.ACTIVE,
      metadata,
    },
    include: projectInclude,
  });
  await emitCpSystemEvent({
    streamType: "PROJECT",
    subjectType: "PROJECT",
    subjectId: updated.id,
    eventName: "project.resumed",
  });
  return updated;
}

export async function listCpProjectDocs(projectId: string) {
  return dbAny.cpProjectDoc.findMany({
    where: { projectId, archivedAt: null, isActive: true },
    orderBy: { kind: "asc" },
  });
}

export async function createCpProjectDoc(input: CreateCpProjectDocInput) {
  return db.$transaction(async (tx) => {
    const controlTx = tx as any;
    await controlTx.cpProjectDoc.updateMany({
      where: { projectId: input.projectId, kind: input.kind, isActive: true },
      data: { isActive: false },
    });

    const created = await controlTx.cpProjectDoc.create({
      data: {
        projectId: input.projectId,
        kind: input.kind,
        title: input.title,
        contentMarkdown: input.contentMarkdown,
        version: 1,
        lastEditedBy: input.editedBy ?? null,
      },
    });

    await controlTx.cpProjectDocVersion.create({
      data: {
        projectDocId: created.id,
        version: 1,
        title: created.title,
        contentMarkdown: created.contentMarkdown,
        editedBy: input.editedBy ?? null,
        editReason: input.editReason ?? null,
      },
    });

    await emitCpSystemEvent({
      streamType: "PROJECT",
      subjectType: "PROJECT_DOC",
      subjectId: created.id,
      eventName: "project-doc.created",
      payload: { projectId: created.projectId, kind: created.kind },
    });
    return created;
  });
}

export async function getCpProjectDoc(id: string) {
  return dbAny.cpProjectDoc.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: "desc" }, take: 10 } },
  });
}

export async function updateCpProjectDoc(id: string, input: UpdateCpProjectDocInput) {
  return db.$transaction(async (tx) => {
    const controlTx = tx as any;
    const existing = await controlTx.cpProjectDoc.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.version !== input.version) {
      const error = new Error("VERSION_CONFLICT");
      (error as Error & { code?: string }).code = "VERSION_CONFLICT";
      throw error;
    }

    const nextVersion = existing.version + 1;
    const updated = await controlTx.cpProjectDoc.update({
      where: { id },
      data: {
        title: input.title ?? existing.title,
        contentMarkdown: input.contentMarkdown ?? existing.contentMarkdown,
        version: nextVersion,
        lastEditedBy: input.editedBy ?? existing.lastEditedBy,
      },
    });

    await controlTx.cpProjectDocVersion.create({
      data: {
        projectDocId: updated.id,
        version: nextVersion,
        title: updated.title,
        contentMarkdown: updated.contentMarkdown,
        editedBy: input.editedBy ?? existing.lastEditedBy,
        editReason: input.editReason ?? null,
      },
    });

    await emitCpSystemEvent({
      streamType: "PROJECT",
      subjectType: "PROJECT_DOC",
      subjectId: updated.id,
      eventName: "project-doc.updated",
      payload: { projectId: updated.projectId, version: updated.version },
    });
    return updated;
  });
}

export async function listCpPhases(projectId: string) {
  return dbAny.cpProjectPhase.findMany({
    where: { projectId, archivedAt: null },
    orderBy: { ordinal: "asc" },
  });
}

export async function createCpPhase(input: CreateCpPhaseInput) {
  const created = await dbAny.cpProjectPhase.create({
    data: {
      projectId: input.projectId,
      phaseKey: input.phaseKey,
      title: input.title,
      ordinal: input.ordinal,
      planningRequired: input.planningRequired ?? false,
      status: input.status ?? CP_PHASE_STATUS.PLANNING,
      entryCriteriaMarkdown: input.entryCriteriaMarkdown ?? null,
      exitCriteriaMarkdown: input.exitCriteriaMarkdown ?? null,
      summaryMarkdown: input.summaryMarkdown ?? null,
    },
  });
  await emitCpSystemEvent({
    streamType: "PHASE",
    subjectType: "PHASE",
    subjectId: created.id,
    eventName: "phase.created",
    payload: { projectId: created.projectId },
  });
  return created;
}

export async function updateCpPhase(id: string, input: UpdateCpPhaseInput) {
  const updated = await dbAny.cpProjectPhase.update({
    where: { id },
    data: {
      title: input.title,
      status: input.status,
      planningRequired: input.planningRequired,
      entryCriteriaMarkdown: input.entryCriteriaMarkdown,
      exitCriteriaMarkdown: input.exitCriteriaMarkdown,
      summaryMarkdown: input.summaryMarkdown,
    },
  });
  await emitCpSystemEvent({
    streamType: "PHASE",
    subjectType: "PHASE",
    subjectId: updated.id,
    eventName: "phase.updated",
    payload: { projectId: updated.projectId, status: updated.status },
  });
  return updated;
}

export async function listCpWorkItems(filters: { projectId?: string; phaseId?: string; status?: CpWorkItemStatusValue; type?: CpWorkItemTypeValue; autonomousEligible?: boolean }) {
  const where = {
    archivedAt: null,
    ...(filters.status ? { status: filters.status } : { status: { not: CP_WORK_ITEM_STATUS.ARCHIVED } }),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.phaseId ? { phaseId: filters.phaseId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(typeof filters.autonomousEligible === "boolean" ? { autonomousEligible: filters.autonomousEligible } : {}),
  };

  try {
    const items = await dbAny.cpWorkItem.findMany({
      where,
      include: {
        phase: true,
        project: true,
        executionRuns: { orderBy: { createdAt: "desc" }, take: 1 },
        labels: true,
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    return items.map(applyPauseReadiness);
  } catch (error: any) {
    const code = typeof error?.code === "string" ? error.code : "";
    const message = typeof error?.message === "string" ? error.message : "";
    const maybeLabelSchemaDrift =
      (code === "P2021" || code === "P2022") &&
      (message.includes("cp_work_item_labels") || message.includes("labels"));

    if (!maybeLabelSchemaDrift) throw error;

    const items = await dbAny.cpWorkItem.findMany({
      where,
      include: {
        phase: true,
        project: true,
        executionRuns: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    return items.map((item: any) => applyPauseReadiness({ ...item, labels: [] }));
  }
}

export async function createCpWorkItem(input: CreateCpWorkItemInput) {
  const created = await dbAny.cpWorkItem.create({
    data: {
      projectId: input.projectId,
      phaseId: input.phaseId ?? null,
      type: input.type,
      title: input.title,
      descriptionMarkdown: input.descriptionMarkdown ?? null,
      status: input.status ?? (input.type === CP_WORK_ITEM_TYPE.PLANNING ? CP_WORK_ITEM_STATUS.PLANNING : CP_WORK_ITEM_STATUS.READY),
      autonomyLevel: input.autonomyLevel ?? CP_AUTONOMY_LEVEL.MANUAL,
      riskLevel: input.riskLevel ?? CP_RISK_LEVEL.MEDIUM,
      dataClass: input.dataClass ?? null,
      assignedAgentKey: input.assignedAgentKey ?? null,
      autonomousEligible: input.autonomousEligible ?? false,
      priority: input.priority ?? null,
      recommendedCapabilities: input.recommendedCapabilities ?? null,
      recommendedSkills: input.recommendedSkills ?? null,
      recommendedTools: input.recommendedTools ?? null,
    },
    include: {
      phase: true,
      project: true,
    },
  });
  await emitCpSystemEvent({
    streamType: "WORK_ITEM",
    subjectType: "WORK_ITEM",
    subjectId: created.id,
    eventName: "work-item.created",
    payload: { projectId: created.projectId, phaseId: created.phaseId, status: created.status },
  });
  return created;
}

export async function getCpWorkItem(id: string) {
  const item = await dbAny.cpWorkItem.findUnique({
    where: { id },
    include: {
      project: true,
      phase: true,
      labels: true,
      executionRuns: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { approvalEnvelope: true, events: { orderBy: { occurredAt: "asc" } } },
      },
    },
  });
  return item ? applyPauseReadiness(item) : null;
}

export async function updateCpWorkItem(id: string, input: UpdateCpWorkItemInput) {
  const updated = await dbAny.cpWorkItem.update({
    where: { id },
    data: {
      title: input.title,
      descriptionMarkdown: input.descriptionMarkdown,
      status: input.status,
      autonomyLevel: input.autonomyLevel,
      riskLevel: input.riskLevel,
      dataClass: input.dataClass,
      phaseId: input.phaseId,
      assignedAgentKey: input.assignedAgentKey,
      autonomousEligible: input.autonomousEligible,
      priority: input.priority,
      recommendedCapabilities: input.recommendedCapabilities,
      recommendedSkills: input.recommendedSkills,
      recommendedTools: input.recommendedTools,
    },
    include: { project: true, phase: true },
  });
  await emitCpSystemEvent({
    streamType: "WORK_ITEM",
    subjectType: "WORK_ITEM",
    subjectId: updated.id,
    eventName: "work-item.updated",
    payload: { projectId: updated.projectId, phaseId: updated.phaseId, status: updated.status },
  });
  return updated;
}

export async function listCpDependencies(filters: { subjectType?: string; subjectId?: string }) {
  return dbAny.cpDependencyEdge.findMany({
    where: {
      archivedAt: null,
      ...(filters.subjectType && filters.subjectId
        ? {
            OR: [
              { fromSubjectType: filters.subjectType, fromSubjectId: filters.subjectId },
              { toSubjectType: filters.subjectType, toSubjectId: filters.subjectId },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteCpDependency(id: string) {
  const updated = await dbAny.cpDependencyEdge.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  await emitCpSystemEvent({
    streamType: "DEPENDENCY",
    subjectType: "DEPENDENCY",
    subjectId: updated.id,
    eventName: "dependency.archived",
    payload: { fromSubjectId: updated.fromSubjectId, toSubjectId: updated.toSubjectId },
  });
  return updated;
}

export async function createCpDependency(input: CreateCpDependencyInput) {
  const fromType = input.fromSubjectType.toUpperCase();
  const toType = input.toSubjectType.toUpperCase();
  const edgeType = input.edgeType.toUpperCase();

  if (
    fromType === toType &&
    input.fromSubjectId === input.toSubjectId &&
    edgeType === "BLOCKS"
  ) {
    const error = new Error("DEPENDENCY_CYCLE");
    (error as Error & { code?: string }).code = "DEPENDENCY_CYCLE";
    throw error;
  }

  if (edgeType === "BLOCKS" && fromType === "WORK_ITEM" && toType === "WORK_ITEM") {
    const existingEdges = await dbAny.cpDependencyEdge.findMany({
      where: {
        archivedAt: null,
        edgeType: "BLOCKS",
        fromSubjectType: "WORK_ITEM",
        toSubjectType: "WORK_ITEM",
      },
      select: {
        fromSubjectId: true,
        toSubjectId: true,
      },
    });

    if (dependencyWouldCreateCycle(existingEdges, input.fromSubjectId, input.toSubjectId)) {
      const error = new Error("DEPENDENCY_CYCLE");
      (error as Error & { code?: string }).code = "DEPENDENCY_CYCLE";
      throw error;
    }
  }

  const created = await dbAny.cpDependencyEdge.create({
    data: {
      fromSubjectType: fromType,
      fromSubjectId: input.fromSubjectId,
      toSubjectType: toType,
      toSubjectId: input.toSubjectId,
      edgeType,
      scope: input.scope.toUpperCase(),
      strength: input.strength?.toUpperCase() ?? "HARD",
      reason: input.reason ?? null,
      createdBy: input.createdBy ?? null,
    },
  });
  await emitCpSystemEvent({
    streamType: "DEPENDENCY",
    subjectType: "DEPENDENCY",
    subjectId: created.id,
    eventName: "dependency.created",
    payload: { fromSubjectId: created.fromSubjectId, toSubjectId: created.toSubjectId, edgeType: created.edgeType },
  });
  return created;
}

export async function validateCpDependencies(inputs: CreateCpDependencyInput[]) {
  for (const input of inputs) {
    const fromType = input.fromSubjectType.toUpperCase();
    const toType = input.toSubjectType.toUpperCase();
    const edgeType = input.edgeType.toUpperCase();

    if (fromType === toType && input.fromSubjectId === input.toSubjectId && edgeType === "BLOCKS") {
      const error = new Error("DEPENDENCY_CYCLE");
      (error as Error & { code?: string }).code = "DEPENDENCY_CYCLE";
      throw error;
    }

    if (edgeType === "BLOCKS" && fromType === "WORK_ITEM" && toType === "WORK_ITEM") {
      const existingEdges = await dbAny.cpDependencyEdge.findMany({
        where: {
          archivedAt: null,
          edgeType: "BLOCKS",
          fromSubjectType: "WORK_ITEM",
          toSubjectType: "WORK_ITEM",
        },
        select: {
          fromSubjectId: true,
          toSubjectId: true,
        },
      });

      const proposedEdges = inputs
        .filter((edge) => edge.edgeType.toUpperCase() === "BLOCKS" && edge.fromSubjectType.toUpperCase() === "WORK_ITEM" && edge.toSubjectType.toUpperCase() === "WORK_ITEM")
        .map((edge) => ({ fromSubjectId: edge.fromSubjectId, toSubjectId: edge.toSubjectId }));

      if (dependencyWouldCreateCycle([...existingEdges, ...proposedEdges], input.fromSubjectId, input.toSubjectId)) {
        const error = new Error("DEPENDENCY_CYCLE");
        (error as Error & { code?: string }).code = "DEPENDENCY_CYCLE";
        throw error;
      }
    }
  }

  return { valid: true };
}

export async function listCpApprovalRequests(filters: { domain?: string; status?: string; subjectType?: string; subjectId?: string }) {
  return dbAny.cpApprovalRequest.findMany({
    where: {
      ...(filters.domain ? { domain: filters.domain } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.subjectType ? { subjectType: filters.subjectType } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    },
    include: {
      decisions: { orderBy: { createdAt: "desc" } },
      bindings: true,
    },
    orderBy: { requestedAt: "desc" },
  });
}

export async function listCpApprovalPolicies(filters: { domain?: string; projectId?: string; capabilityKey?: string }) {
  return dbAny.cpApprovalPolicy.findMany({
    where: {
      isActive: true,
      ...(filters.domain ? { domain: filters.domain.toUpperCase() } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.capabilityKey ? { capabilityKey: filters.capabilityKey } : {}),
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });
}

export async function getCpApprovalPolicy(id: string) {
  return dbAny.cpApprovalPolicy.findUnique({ where: { id } });
}

export async function createCpApprovalPolicy(input: CreateCpApprovalPolicyInput) {
  const created = await dbAny.cpApprovalPolicy.create({
    data: {
      domain: input.domain.toUpperCase(),
      subjectType: input.subjectType ?? null,
      projectId: input.projectId ?? null,
      phaseId: input.phaseId ?? null,
      workItemType: input.workItemType?.toUpperCase() ?? null,
      autonomyLevel: input.autonomyLevel?.toUpperCase() ?? null,
      riskLevel: input.riskLevel?.toUpperCase() ?? null,
      dataClass: input.dataClass ?? null,
      capabilityKey: input.capabilityKey ?? null,
      decisionRule: input.decisionRule.toUpperCase(),
      requiresRole: input.requiresRole ?? null,
      priority: input.priority ?? 100,
      ruleJson: (input.ruleJson as any) ?? null,
    },
  });
  await emitCpSystemEvent({
    streamType: "APPROVAL",
    subjectType: "APPROVAL_POLICY",
    subjectId: created.id,
    eventName: "approval-policy.created",
    payload: { domain: created.domain, decisionRule: created.decisionRule },
  });
  return created;
}

export async function updateCpApprovalPolicy(id: string, input: UpdateCpApprovalPolicyInput) {
  const updated = await dbAny.cpApprovalPolicy.update({
    where: { id },
    data: {
      subjectType: input.subjectType,
      projectId: input.projectId,
      phaseId: input.phaseId,
      workItemType: input.workItemType?.toUpperCase(),
      autonomyLevel: input.autonomyLevel?.toUpperCase(),
      riskLevel: input.riskLevel?.toUpperCase(),
      dataClass: input.dataClass,
      capabilityKey: input.capabilityKey,
      decisionRule: input.decisionRule?.toUpperCase(),
      requiresRole: input.requiresRole,
      priority: input.priority ?? undefined,
      ruleJson: input.ruleJson as any,
      isActive: input.isActive ?? undefined,
    },
  });
  await emitCpSystemEvent({
    streamType: "APPROVAL",
    subjectType: "APPROVAL_POLICY",
    subjectId: updated.id,
    eventName: updated.isActive ? "approval-policy.updated" : "approval-policy.deactivated",
    payload: { decisionRule: updated.decisionRule, isActive: updated.isActive },
  });
  return updated;
}

export async function getCpExecutionRun(id: string) {
  return dbAny.cpExecutionRun.findUnique({
    where: { id },
    include: {
      project: true,
      phase: true,
      workItem: true,
      approvalEnvelope: true,
      events: { orderBy: { occurredAt: "asc" } },
    },
  });
}

export async function listCpExecutionRuns(filters: {
  projectId?: string;
  workItemId?: string;
  status?: string;
  pilotOnly?: boolean;
  autonomousOnly?: boolean;
}) {
  const workItemWhere: Record<string, unknown> = {};
  if (filters.autonomousOnly) {
    workItemWhere.autonomousEligible = true;
  }
  if (filters.pilotOnly) {
    workItemWhere.title = {
      startsWith: "Run recurring",
    };
  }

  return dbAny.cpExecutionRun.findMany({
    where: {
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.workItemId ? { workItemId: filters.workItemId } : {}),
      ...(filters.status ? { status: filters.status.toUpperCase() } : {}),
      ...(Object.keys(workItemWhere).length > 0 ? { workItem: workItemWhere } : {}),
    },
    include: {
      project: true,
      phase: true,
      workItem: true,
      approvalEnvelope: true,
      events: { orderBy: { occurredAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function resolveCpCapabilityPolicy(run: any) {
  const workItem = await dbAny.cpWorkItem.findUnique({ where: { id: run.workItemId } });
  const policies = await dbAny.cpApprovalPolicy.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  const capabilityPolicy: Record<string, string> = {};
  const matchExplanation: Record<string, Array<Record<string, unknown>>> = {};

  const applyDefaultCapability = (capabilityKey: string, decisionRule: string, source: string) => {
    if (capabilityPolicy[capabilityKey]) return;
    capabilityPolicy[capabilityKey] = decisionRule;
    matchExplanation[capabilityKey] = [
      {
        policyId: `default-${source}-${capabilityKey}`,
        decisionRule,
        priority: Number.MAX_SAFE_INTEGER,
        source: "default",
      },
    ];
  };
  for (const policy of policies) {
    if (!policy.capabilityKey) continue;
    if (policy.projectId && policy.projectId !== run.projectId) continue;
    if (policy.phaseId && policy.phaseId !== run.phaseId) continue;
    if (policy.workItemType && policy.workItemType !== workItem?.type) continue;
    if (policy.autonomyLevel && policy.autonomyLevel !== workItem?.autonomyLevel) continue;
    if (policy.riskLevel && policy.riskLevel !== workItem?.riskLevel) continue;
    if (policy.dataClass && policy.dataClass !== workItem?.dataClass) continue;
    capabilityPolicy[policy.capabilityKey] = policy.decisionRule;
    const matches = matchExplanation[policy.capabilityKey] ?? [];
    matches.push({
      policyId: policy.id,
      decisionRule: policy.decisionRule,
      priority: policy.priority,
      projectId: policy.projectId,
      phaseId: policy.phaseId,
      workItemType: policy.workItemType,
      autonomyLevel: policy.autonomyLevel,
      riskLevel: policy.riskLevel,
      dataClass: policy.dataClass,
    });
    matchExplanation[policy.capabilityKey] = matches;
  }

  applyDefaultCapability("filesystem.read_inbox", "ALLOW", "allow");
  applyDefaultCapability("filesystem.write_outbox", "ALLOW", "allow");
  applyDefaultCapability("filesystem.write_project", "ALLOW", "allow");

  applyDefaultCapability("filesystem.write_inbox", "DENY", "deny");
  applyDefaultCapability("filesystem.read_outbox", "DENY", "deny");
  applyDefaultCapability("filesystem.hidden_workspace", "DENY", "deny");
  applyDefaultCapability("filesystem.path_escape", "DENY", "deny");

  const mutationDecision = workItem?.autonomyLevel === CP_AUTONOMY_LEVEL.TRUSTED_AUTO ? "ALLOW" : "APPROVAL_REQUIRED";
  applyDefaultCapability("schedule-mutation", mutationDecision, mutationDecision === "ALLOW" ? "allow" : "approval-required");
  applyDefaultCapability("external-send", mutationDecision, mutationDecision === "ALLOW" ? "allow" : "approval-required");
  applyDefaultCapability("production-change", mutationDecision, mutationDecision === "ALLOW" ? "allow" : "approval-required");

  return { capabilityPolicy, matchExplanation };
}

type CpGuardrailCheckInput = {
  capabilityKey?: string | null;
  operation?: string | null;
  resourcePath?: string | null;
};

function normalizeWorkspacePath(rawPath: string) {
  const normalized = rawPath.replace(/\\/g, "/").trim();
  if (!normalized) return normalized;
  return normalized.replace(/\/+/g, "/");
}

function deriveCapabilityKeyFromGuardrailInput(input: CpGuardrailCheckInput) {
  if (input.capabilityKey?.trim()) return input.capabilityKey.trim();

  const operation = (input.operation ?? "").trim().toLowerCase();
  const resourcePath = normalizeWorkspacePath(input.resourcePath ?? "");
  const pathLower = resourcePath.toLowerCase();

  if (operation === "schedule-mutation") return "schedule-mutation";
  if (operation === "external-send") return "external-send";
  if (operation === "production-change") return "production-change";

  if (!resourcePath) return null;

  if (pathLower.includes("../") || pathLower.startsWith("../") || pathLower === "..") {
    return "filesystem.path_escape";
  }

  if (pathLower.includes("/inbox") || pathLower.endsWith("/inbox") || pathLower === "inbox") {
    return operation === "write" ? "filesystem.write_inbox" : "filesystem.read_inbox";
  }

  if (pathLower.includes("/outbox") || pathLower.endsWith("/outbox") || pathLower === "outbox") {
    return operation === "read" ? "filesystem.read_outbox" : "filesystem.write_outbox";
  }

  const isCanonicalWorkspacePath =
    pathLower.includes("/.openclaw/workspace/") ||
    pathLower.startsWith(".openclaw/workspace/") ||
    pathLower.startsWith("/users/openclaw/.openclaw/workspace/");
  const hiddenSegment = pathLower.split("/").some((segment) => segment.startsWith(".") && segment.length > 1);
  if (hiddenSegment && !isCanonicalWorkspacePath) return "filesystem.hidden_workspace";

  return operation === "write" ? "filesystem.write_project" : null;
}

export async function evaluateCpGuardrail(runId: string, input: CpGuardrailCheckInput) {
  const run = await getCpExecutionRun(runId);
  if (!run) return null;

  const capabilityKey = deriveCapabilityKeyFromGuardrailInput(input);
  if (!capabilityKey) {
    return {
      capabilityKey: null,
      resolution: "ALLOW",
      matchExplanation: [],
    };
  }

  const policyEnvelope = (run.approvalEnvelope?.capabilityPolicyJson ?? {}) as {
    capabilities?: Record<string, string>;
    matchExplanation?: Record<string, Array<Record<string, unknown>>>;
  };

  return {
    capabilityKey,
    resolution: policyEnvelope.capabilities?.[capabilityKey] ?? "ALLOW",
    matchExplanation: policyEnvelope.matchExplanation?.[capabilityKey] ?? [],
  };
}

export async function createCpApprovalRequest(input: CreateCpApprovalRequestInput) {
  const created = await dbAny.cpApprovalRequest.create({
    data: {
      domain: input.domain.toUpperCase(),
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      trigger: input.trigger,
      reason: input.reason,
      requiredRole: input.requiredRole ?? null,
      requestedByRunId: input.requestedByRunId ?? null,
      requestedByActor: input.requestedByActor ?? null,
      metadata: (input.metadata as any) ?? null,
    },
    include: {
      decisions: true,
      bindings: true,
    },
  });
  await emitCpSystemEvent({
    streamType: "APPROVAL",
    subjectType: "APPROVAL_REQUEST",
    subjectId: created.id,
    eventName: "approval-request.created",
    payload: { domain: created.domain, subjectType: created.subjectType, subjectId: created.subjectId },
  });
  return created;
}

export async function getCpApprovalRequest(id: string) {
  return dbAny.cpApprovalRequest.findUnique({
    where: { id },
    include: {
      decisions: { orderBy: { createdAt: "desc" } },
      bindings: true,
      requestedByRun: {
        include: {
          approvalEnvelope: true,
          events: { orderBy: { occurredAt: "asc" } },
          workItem: true,
          project: true,
        },
      },
    },
  });
}

export async function explainCpApprovalRequest(id: string) {
  const request = await getCpApprovalRequest(id);
  if (!request) return null;

  const explanation = request.requestedByRun?.approvalEnvelope?.capabilityPolicyJson?.matchExplanation?.[request.trigger] ?? [];

  return {
    request,
    explanation,
    resolvedDecision:
      request.requestedByRun?.approvalEnvelope?.capabilityPolicyJson?.capabilities?.[request.trigger] ?? null,
  };
}

export async function decideCpApprovalRequest(input: DecideCpApprovalRequestInput) {
  return db.$transaction(async (tx) => {
    const controlTx = tx as any;
    const request = await controlTx.cpApprovalRequest.findUnique({
      where: { id: input.approvalRequestId },
    });
    if (!request) return null;

    const decision = input.decision.toUpperCase();
    const updated = await controlTx.cpApprovalRequest.update({
      where: { id: input.approvalRequestId },
      data: {
        status: decision,
        resolvedAt: new Date(),
      },
    });

    await controlTx.cpApprovalDecisionRecord.create({
      data: {
        approvalRequestId: input.approvalRequestId,
        decision,
        decisionMode: input.decisionMode,
        decidedBy: input.decidedBy ?? null,
        reason: input.reason ?? null,
        metadata: (input.metadata as any) ?? null,
      },
    });

    if (decision === "APPROVED" && input.bindingType) {
      await controlTx.cpApprovalBinding.create({
        data: {
          approvalRequestId: input.approvalRequestId,
          subjectType: request.subjectType,
          subjectId: request.subjectId,
          bindingType: input.bindingType.toUpperCase(),
        },
      });
    }

    const result = await controlTx.cpApprovalRequest.findUnique({
      where: { id: updated.id },
      include: {
        decisions: { orderBy: { createdAt: "desc" } },
        bindings: true,
      },
    });
    await emitCpSystemEvent({
      streamType: "APPROVAL",
      subjectType: "APPROVAL_REQUEST",
      subjectId: updated.id,
      eventName: "approval-request.decided",
      payload: { decision },
    });
    return result;
  });
}

export async function createCpExecutionRun(input: CreateCpExecutionRunInput) {
  const workItem = await dbAny.cpWorkItem.findUnique({
    where: { id: input.workItemId },
    include: { project: true },
  });
  if (!workItem) return null;
  if (workItem.project.status === CP_PROJECT_STATUS.PAUSED) {
    const error = new Error("PROJECT_PAUSED");
    (error as Error & { code?: string }).code = "PROJECT_PAUSED";
    throw error;
  }

  const latestRun = await dbAny.cpExecutionRun.findFirst({
    where: { workItemId: workItem.id },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true },
  });

  const created = await dbAny.cpExecutionRun.create({
    data: {
      workItemId: workItem.id,
      projectId: workItem.projectId,
      phaseId: workItem.phaseId,
      attemptNumber: (latestRun?.attemptNumber ?? 0) + 1,
      assembledInstructionsSnapshot: workItem.descriptionMarkdown || input.reason || `Execution run for ${workItem.title}`,
      status: "ACCEPTED",
      responsePayload: input.reason ? { reason: input.reason } : null,
    },
    include: {
      project: true,
      phase: true,
      workItem: true,
    },
  });

  const { capabilityPolicy, matchExplanation } = await resolveCpCapabilityPolicy(created);
  await dbAny.cpRunApprovalEnvelope.create({
    data: {
      executionRunId: created.id,
      trustMode: created.project.defaultTrustMode,
      capabilityPolicyJson: {
        capabilities: capabilityPolicy,
        matchExplanation,
      },
      effectivePolicyHash: JSON.stringify({ capabilityPolicy, matchExplanation }),
    },
  });

  await emitCpSystemEvent({
    streamType: "EXECUTION",
    subjectType: "EXECUTION_RUN",
    subjectId: created.id,
    eventName: "execution-run.created",
    payload: { workItemId: created.workItemId, projectId: created.projectId },
  });

  return getCpExecutionRun(created.id);
}

export async function handleCpApprovalNeeded(runId: string, input: { capabilityKey: string; reason: string; payloadSummary?: unknown }) {
  const run = await getCpExecutionRun(runId);
  if (!run) return null;
  const policyEnvelope = (run.approvalEnvelope?.capabilityPolicyJson ?? {}) as {
    capabilities?: Record<string, string>;
    matchExplanation?: Record<string, Array<Record<string, unknown>>>;
  };
  const policy = policyEnvelope.capabilities ?? {};
  const resolution = policy[input.capabilityKey] ?? "ALLOW";

  await dbAny.cpRunEvent.create({
    data: {
      executionRunId: runId,
      eventType: "APPROVAL_NEEDED",
      message: input.reason,
      payload: {
        capabilityKey: input.capabilityKey,
        payloadSummary: input.payloadSummary ?? null,
        resolution,
        matchExplanation: policyEnvelope.matchExplanation?.[input.capabilityKey] ?? [],
      },
    },
  });
  await emitCpSystemEvent({
    streamType: "EXECUTION",
    subjectType: "EXECUTION_RUN",
    subjectId: runId,
    eventName: "execution-run.approval-needed",
    payload: { capabilityKey: input.capabilityKey, resolution },
  });

  if (resolution === "ALLOW") {
    return { resolution: "APPROVED", approvalRequestId: null };
  }
  if (resolution === "DENY") {
    return { resolution: "DENIED", approvalRequestId: null };
  }

  const request = await createCpApprovalRequest({
    domain: "ACTION",
    subjectType: "EXECUTION_RUN",
    subjectId: runId,
    trigger: input.capabilityKey,
    reason: input.reason,
    requestedByRunId: runId,
    metadata: { payloadSummary: input.payloadSummary ?? null },
  });

  await dbAny.cpExecutionRun.update({
    where: { id: runId },
    data: { status: "WAITING_APPROVAL" },
  });

  return {
    resolution: "PENDING_APPROVAL",
    approvalRequestId: request.id,
    matchExplanation: policyEnvelope.matchExplanation?.[input.capabilityKey] ?? [],
  };
}

export async function resumeCpExecutionRun(runId: string, input: { approvalRequestId?: string | null; decision?: string | null }) {
  const run = await getCpExecutionRun(runId);
  if (!run) return null;

  const decision = (input.decision ?? "APPROVED").toUpperCase();
  const nextStatus = decision === "APPROVED" ? "RUNNING" : "CANCELLED";

  const updated = await dbAny.cpExecutionRun.update({
    where: { id: runId },
    data: { status: nextStatus },
  });

  await dbAny.cpRunEvent.create({
    data: {
      executionRunId: runId,
      eventType: "RESUME_DECISION",
      message: `Execution ${decision === "APPROVED" ? "resumed" : "cancelled"}`,
      payload: {
        approvalRequestId: input.approvalRequestId ?? null,
        decision,
      },
    },
  });
  await emitCpSystemEvent({
    streamType: "EXECUTION",
    subjectType: "EXECUTION_RUN",
    subjectId: runId,
    eventName: "execution-run.resumed",
    payload: { decision, status: nextStatus },
  });

  return getCpExecutionRun(updated.id);
}

export async function reportCpExecutionRun(
  runId: string,
  input: {
    status: string;
    message?: string | null;
    payload?: unknown;
    errorText?: string | null;
  },
) {
  const run = await getCpExecutionRun(runId);
  if (!run) return null;

  const normalizedStatus = input.status.toUpperCase();
  const isRecurringWorkItem = Boolean(run.workItem?.title?.startsWith("Run recurring "));
  const now = new Date();
  const data: Record<string, unknown> = {
    status: normalizedStatus,
  };

  if (normalizedStatus === "RUNNING" && !run.startedAt) {
    data.startedAt = now;
  }

  if (["COMPLETED", "FAILED", "CANCELLED"].includes(normalizedStatus)) {
    data.finishedAt = now;
  }

  if (typeof input.errorText === "string") {
    data.errorText = input.errorText;
  }

  await dbAny.cpExecutionRun.update({
    where: { id: runId },
    data,
  });

  await dbAny.cpRunEvent.create({
    data: {
      executionRunId: runId,
      eventType: normalizedStatus,
      message: input.message ?? null,
      payload: (input.payload as any) ?? null,
    },
  });

  const nextWorkItemStatus =
    normalizedStatus === "RUNNING"
      ? CP_WORK_ITEM_STATUS.IN_PROGRESS
      : normalizedStatus === "COMPLETED"
        ? isRecurringWorkItem
          ? CP_WORK_ITEM_STATUS.READY
          : CP_WORK_ITEM_STATUS.DONE
        : ["FAILED", "CANCELLED"].includes(normalizedStatus)
          ? isRecurringWorkItem
            ? CP_WORK_ITEM_STATUS.READY
            : CP_WORK_ITEM_STATUS.BLOCKED
          : null;

  if (nextWorkItemStatus && run.workItemId) {
    await dbAny.cpWorkItem.update({
      where: { id: run.workItemId },
      data: {
        status: nextWorkItemStatus,
        blockedReasonCache:
          nextWorkItemStatus === CP_WORK_ITEM_STATUS.BLOCKED
            ? {
                type: normalizedStatus,
                message: input.message ?? input.errorText ?? `Execution run ${normalizedStatus.toLowerCase()}`,
                pausedReason: null,
              }
            : null,
      },
    });

    await emitCpSystemEvent({
      streamType: "WORK_ITEM",
      subjectType: "WORK_ITEM",
      subjectId: run.workItemId,
      eventName: "work-item.updated",
      payload: {
        projectId: run.projectId,
        phaseId: run.phaseId,
        status: nextWorkItemStatus,
        executionRunStatus: normalizedStatus,
      },
    });
  }

  await emitCpSystemEvent({
    streamType: "EXECUTION",
    subjectType: "EXECUTION_RUN",
    subjectId: runId,
    eventName: `execution-run.${normalizedStatus.toLowerCase()}`,
    payload: {
      status: normalizedStatus,
      message: input.message ?? null,
    },
  });

  return getCpExecutionRun(runId);
}

export async function listCpRealityAudits(filters: { projectId?: string; status?: string }) {
  return dbAny.cpRealityAudit.findMany({
    where: {
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.status ? { status: filters.status.toUpperCase() } : {}),
    },
    include: {
      findings: true,
      project: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCpProjectDependencyMap(projectId: string) {
  const workItems = await dbAny.cpWorkItem.findMany({
    where: { projectId, archivedAt: null },
    select: { id: true, title: true, status: true, type: true, phaseId: true },
    orderBy: { createdAt: "asc" },
  });
  const workItemIds = workItems.map((item: any) => item.id);
  const dependencies = await dbAny.cpDependencyEdge.findMany({
    where: {
      archivedAt: null,
      OR: [
        { fromSubjectType: "PROJECT", fromSubjectId: projectId },
        { toSubjectType: "PROJECT", toSubjectId: projectId },
        { fromSubjectType: "WORK_ITEM", fromSubjectId: { in: workItemIds } },
        { toSubjectType: "WORK_ITEM", toSubjectId: { in: workItemIds } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    projectId,
    nodes: workItems,
    edges: dependencies,
  };
}

export async function createCpRealityAudit(input: CreateCpRealityAuditInput) {
  return db.$transaction(async (tx) => {
    const controlTx = tx as any;
    const audit = await controlTx.cpRealityAudit.create({
      data: {
        projectId: input.projectId,
        sourceType: input.sourceType.toUpperCase(),
        confidenceMode: input.confidenceMode.toUpperCase(),
        status: "PENDING",
        summary: input.summary ?? null,
      },
      include: { project: true },
    });

    const docs = await controlTx.cpProjectDoc.findMany({
      where: { projectId: input.projectId, isActive: true, archivedAt: null },
      orderBy: { kind: "asc" },
    });
    const importBatches = await controlTx.cpImportBatch.findMany({
      where: { projectId: input.projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const findings = docs.flatMap((doc: any) => {
      const content = String(doc.contentMarkdown ?? "");
      const headings = extractMarkdownHeadings(content);
      const acceptanceCriteria = extractAcceptanceCriteria(content);
      const taskCandidates = extractTaskCandidates(content);
      const docFindings = [
        {
          realityAuditId: audit.id,
          claimType: "doc_claim",
          claimText: `${doc.kind} reviewed during audit bootstrap`,
          result: "UNCLEAR",
          evidenceJson: {
            projectDocId: doc.id,
            version: doc.version,
            title: doc.title,
            stats: {
              lines: content.split("\n").length,
              headings: headings.length,
              checkboxes: taskCandidates.length,
              checked: taskCandidates.filter((item) => item.done).length,
            },
          },
          proposedNextAction: "Review and validate document claims",
        },
      ];

      const checkedItems = taskCandidates
        .filter((item) => item.done)
        .slice(0, 10)
        .map((item) => ({
          realityAuditId: audit.id,
          claimType: "status_claim",
          claimText: `Completed claim: ${item.text}`,
          result: "UNCLEAR",
          evidenceJson: { projectDocId: doc.id, version: doc.version, sourceKind: doc.kind },
          proposedNextAction: "Verify completion claim against evidence",
        }));

      const phaseHeadings = headings
        .filter((heading) => /phase\s+\d+/i.test(heading))
        .slice(0, 10)
        .map((heading) => ({
          realityAuditId: audit.id,
          claimType: "phase_claim",
          claimText: `Phase structure referenced: ${heading}`,
          result: "UNCLEAR",
          evidenceJson: { projectDocId: doc.id, version: doc.version, sourceKind: doc.kind },
          proposedNextAction: "Verify phase boundaries and planning requirements",
        }));

      const acceptanceFindings = acceptanceCriteria.slice(0, 10).map((criterion) => ({
        realityAuditId: audit.id,
        claimType: "acceptance_claim",
        claimText: `Acceptance criterion: ${criterion}`,
        result: "UNCLEAR",
        evidenceJson: { projectDocId: doc.id, version: doc.version, sourceKind: doc.kind },
        proposedNextAction: "Verify whether criterion is still valid and measurable",
      }));

      const taskCandidateFindings = taskCandidates
        .filter((item) => !item.done)
        .slice(0, 10)
        .map((item) => ({
          realityAuditId: audit.id,
          claimType: "task_candidate",
          claimText: `Task candidate: ${item.text}`,
          result: "UNCLEAR",
          evidenceJson: { projectDocId: doc.id, version: doc.version, sourceKind: doc.kind },
          proposedNextAction: "Review whether this should become a planning or execution work item",
        }));

      return [...docFindings, ...checkedItems, ...phaseHeadings, ...acceptanceFindings, ...taskCandidateFindings];
    });

    const importFindings = importBatches.map((batch: any) => ({
      realityAuditId: audit.id,
      claimType: "import_claim",
      claimText: `Import batch observed from ${batch.sourceType}`,
      result: "UNCLEAR",
      evidenceJson: {
        importBatchId: batch.id,
        sourceRef: batch.sourceRef,
        sourceHash: batch.sourceHash,
        status: batch.status,
      },
      proposedNextAction: "Check whether imported context reflects current project reality",
    }));

    if (findings.length > 0 || importFindings.length > 0) {
      await controlTx.cpRealityFinding.createMany({ data: [...findings, ...importFindings] });
    }

    const result = await controlTx.cpRealityAudit.findUnique({
      where: { id: audit.id },
      include: { findings: true, project: true },
    });
    await emitCpSystemEvent({
      streamType: "AUDIT",
      subjectType: "REALITY_AUDIT",
      subjectId: audit.id,
      eventName: "reality-audit.created",
      payload: { projectId: audit.projectId },
    });
    return result;
  });
}

export async function getCpRealityAudit(id: string) {
  return dbAny.cpRealityAudit.findUnique({
    where: { id },
    include: { findings: true, project: true },
  });
}

export async function listCpRealityFindings(realityAuditId: string, filters: { result?: string; claimType?: string }) {
  return dbAny.cpRealityFinding.findMany({
    where: {
      realityAuditId,
      ...(filters.result ? { result: filters.result.toUpperCase() } : {}),
      ...(filters.claimType ? { claimType: filters.claimType } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateCpRealityFinding(
  id: string,
  input: { result?: string | null; resolutionNotes?: string | null; proposedNextAction?: string | null }
) {
  const updated = await dbAny.cpRealityFinding.update({
    where: { id },
    data: {
      result: input.result?.toUpperCase(),
      resolutionNotes: input.resolutionNotes,
      proposedNextAction: input.proposedNextAction,
    },
    include: {
      realityAudit: true,
    },
  });
  await emitCpSystemEvent({
    streamType: "AUDIT",
    subjectType: "REALITY_FINDING",
    subjectId: updated.id,
    eventName: "reality-finding.updated",
    payload: { realityAuditId: updated.realityAuditId, result: updated.result },
  });
  return updated;
}

export async function acceptCpRealityAudit(id: string, acceptedBy?: string | null) {
  const updated = await dbAny.cpRealityAudit.update({
    where: { id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      acceptedBy: acceptedBy ?? null,
    },
    include: { findings: true, project: true },
  });
  await emitCpSystemEvent({
    streamType: "AUDIT",
    subjectType: "REALITY_AUDIT",
    subjectId: updated.id,
    eventName: "reality-audit.accepted",
    payload: { projectId: updated.projectId },
  });
  return updated;
}

export async function createCpImportBatch(input: CreateCpImportBatchInput) {
  const created = await dbAny.cpImportBatch.create({
    data: {
      projectId: input.projectId ?? null,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      sourceHash: input.sourceHash ?? null,
      status: "QUEUED",
      summary: input.summary ?? null,
      metadata: (input.metadata as any) ?? null,
    },
  });
  await emitCpSystemEvent({
    streamType: "SYSTEM",
    subjectType: "IMPORT_BATCH",
    subjectId: created.id,
    eventName: "import-batch.created",
    payload: { projectId: created.projectId, sourceType: created.sourceType },
  });
  return created;
}

export async function getCpImportBatch(id: string) {
  return dbAny.cpImportBatch.findUnique({ where: { id }, include: { project: true } });
}

export async function createCpExportSnapshot(input: CreateCpExportSnapshotInput) {
  const timestamp = new Date().toISOString().replace(/[:]/g, "-");
  const root = process.env.HOUSTON_EXPORTS_ROOT || "/Users/openclaw/openclaw-exports/projects";
  const outputPath = `${root}/${timestamp}${input.projectId ? `-${input.projectId}` : "-all"}`;

  const created = await dbAny.cpExportSnapshot.create({
    data: {
      projectId: input.projectId ?? null,
      triggerType: input.triggerType.toUpperCase(),
      status: "QUEUED",
      outputPath,
      requestedBy: input.requestedBy ?? null,
    },
    include: { project: true },
  });

  await emitCpSystemEvent({
    streamType: "EXPORT",
    subjectType: "EXPORT_SNAPSHOT",
    subjectId: created.id,
    eventName: "export-snapshot.created",
    payload: { projectId: created.projectId, outputPath: created.outputPath },
  });

  return created;
}

export async function processCpExportSnapshot(snapshotId: string) {
  const snapshot = await dbAny.cpExportSnapshot.findUnique({ where: { id: snapshotId }, include: { project: true } });
  if (!snapshot) return null;

  await dbAny.cpExportSnapshot.update({
    where: { id: snapshot.id },
    data: { status: "RUNNING", startedAt: new Date(), errorText: null },
  });

  try {
    await writeControlPlaneExport(snapshot);
    const manifestHash = createHash("sha256")
      .update(`${snapshot.outputPath}:${snapshot.createdAt.toISOString()}`)
      .digest("hex");
    const completed = await dbAny.cpExportSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: "COMPLETED",
        manifestHash,
        finishedAt: new Date(),
      },
      include: { project: true },
    });
    await emitCpSystemEvent({
      streamType: "EXPORT",
      subjectType: "EXPORT_SNAPSHOT",
      subjectId: completed.id,
      eventName: "export-snapshot.completed",
      payload: { outputPath: completed.outputPath },
    });
    return completed;
  } catch (error) {
    const failed = await dbAny.cpExportSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: "FAILED",
        errorText: error instanceof Error ? error.message : "Export failed",
        finishedAt: new Date(),
      },
      include: { project: true },
    });
    await emitCpSystemEvent({
      streamType: "EXPORT",
      subjectType: "EXPORT_SNAPSHOT",
      subjectId: failed.id,
      eventName: "export-snapshot.failed",
      payload: { error: failed.errorText },
    });
    throw error;
  }
}

export async function generateCpWorkItemsFromPhase(phaseId: string) {
  const phase = await dbAny.cpProjectPhase.findUnique({ where: { id: phaseId } });
  if (!phase) return null;

  const docs = await dbAny.cpProjectDoc.findMany({
    where: {
      projectId: phase.projectId,
      isActive: true,
      archivedAt: null,
      kind: { in: ["ACTION_PLAN", "PROJECT"] },
    },
    orderBy: { kind: "asc" },
  });

  const candidates = docs.flatMap((doc: any) =>
    extractTaskCandidates(String(doc.contentMarkdown ?? ""))
      .filter((item) => !item.done)
      .map((item) => ({ doc, item }))
  );

  const created = [];
  for (const candidate of candidates.slice(0, 25)) {
    const existing = await dbAny.cpWorkItem.findFirst({
      where: {
        projectId: phase.projectId,
        phaseId: phase.id,
        title: candidate.item.text,
        archivedAt: null,
      },
    });
    if (existing) continue;
    const item = await dbAny.cpWorkItem.create({
      data: {
        projectId: phase.projectId,
        phaseId: phase.id,
        type: "EXECUTION",
        title: candidate.item.text,
        status: "READY",
        descriptionMarkdown: `Generated from ${candidate.doc.kind} for ${phase.title}`,
        sourceKind: `phase-generation:${candidate.doc.kind}`,
      },
    });
    created.push(item);
    await emitCpSystemEvent({
      streamType: "WORK_ITEM",
      subjectType: "WORK_ITEM",
      subjectId: item.id,
      eventName: "work-item.generated-from-phase",
      payload: { phaseId: phase.id, projectId: phase.projectId },
    });
  }

  return created;
}

export async function getCpExportSnapshot(id: string) {
  return dbAny.cpExportSnapshot.findUnique({ where: { id }, include: { project: true } });
}

export async function listCpExportSnapshots(projectId?: string) {
  return dbAny.cpExportSnapshot.findMany({
    where: projectId ? { projectId } : {},
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listCpSystemEvents(filters: { streamType?: string; cursor?: string; take?: number }) {
  return dbAny.cpSystemEvent.findMany({
    where: {
      ...(filters.streamType ? { streamType: filters.streamType.toUpperCase() } : {}),
      ...(filters.cursor ? { id: { gt: filters.cursor } } : {}),
    },
    orderBy: { occurredAt: "asc" },
    take: filters.take ?? 50,
  });
}
