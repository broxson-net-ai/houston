import fs from "fs";
import os from "os";
import path from "path";

import { ProjectStatus, TaskEventType, TaskStatus } from "@prisma/client";
import { db } from "./db.js";

const DEFAULT_PROJECTS_DIR = path.join(
  os.homedir(),
  ".openclaw",
  "workspace",
  "memory",
  "projects"
);

const PROJECTS_DIR = process.env.OPENCLAW_PROJECTS_DIR ?? DEFAULT_PROJECTS_DIR;
const PORTFOLIO_BOARD_PATH = path.join(PROJECTS_DIR, "PORTFOLIO_EXECUTION.md");
const HOUSTON_TASK_PACK_NOW_PATH = path.join(PROJECTS_DIR, "HOUSTON_TASK_PACK_NOW_2026-03-21.md");

export const PORTFOLIO_SYNC_CONTROL_KEY = "portfolio_sync_control";
export const PORTFOLIO_SYNC_REPORT_KEY = "portfolio_sync_report";

export type PortfolioSyncControl = {
  enabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

export type PortfolioTaskSpec = {
  title: string;
  code: string;
  lane: string;
  queuePrefix: "NOW";
  projectSlug: string;
  autonomyTier: string;
  dataClass: string;
  approvalTriggers: string;
  dependencies: string[];
  rollbackRequired: string;
  successEvidence: string;
};

export type PortfolioSyncReport = {
  ranAt: string;
  sourcePath: string;
  taskPackPath: string;
  controlEnabled: boolean;
  createdProjects: number;
  reusedProjects: number;
  createdTasks: number;
  updatedTasks: number;
  eligibleAutoDispatchTasks: number;
  dependencyEdgesCreated: number;
  dependencyEdgesReused: number;
  skippedQueueItems: string[];
  queueSummary: {
    nowItems: number;
    nextItems: number;
    laterItems: number;
  };
};

function safeRead(filePath: string) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function sectionLinesByPrefix(contents: string, headingPrefix: string) {
  const lines = contents.split(/\r?\n/);
  const target = headingPrefix.trim().toLowerCase();
  const start = lines.findIndex((line) => {
    const t = line.trim().toLowerCase();
    return t.startsWith("## ") && t.includes(target);
  });
  if (start === -1) return [] as string[];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s+/.test(line.trim())) break;
    out.push(line);
  }
  return out;
}

function parseQueueSummary(contents: string) {
  const lines = sectionLinesByPrefix(contents, "6) now / next / later board");
  const summary = { nowItems: 0, nextItems: 0, laterItems: 0 };
  let current: "nowItems" | "nextItems" | "laterItems" | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^###\s+Now/i.test(line)) {
      current = "nowItems";
      continue;
    }
    if (/^###\s+Next/i.test(line)) {
      current = "nextItems";
      continue;
    }
    if (/^###\s+Later/i.test(line)) {
      current = "laterItems";
      continue;
    }
    if ((/^\d+\.\s+/.test(line) || /^-\s+/.test(line)) && current) {
      summary[current] += 1;
    }
  }
  return summary;
}

function parseTaskPackNow(contents: string): PortfolioTaskSpec[] {
  const lines = contents.split(/\r?\n/);
  const specs: PortfolioTaskSpec[] = [];
  let currentLane = "";
  let current: Partial<PortfolioTaskSpec> | null = null;

  function flush() {
    if (!current) return;
    if (
      current.title &&
      current.code &&
      current.lane &&
      current.projectSlug &&
      current.autonomyTier &&
      current.dataClass &&
      current.approvalTriggers !== undefined &&
      current.dependencies &&
      current.rollbackRequired !== undefined &&
      current.successEvidence !== undefined
    ) {
      specs.push(current as PortfolioTaskSpec);
    }
    current = null;
  }

  for (const raw of lines) {
    const line = raw.trim();
    const laneHeading = line.match(/^##\s+Lane\s+([A-Z])\b/i);
    if (laneHeading) {
      currentLane = laneHeading[1].toUpperCase();
      continue;
    }

    const itemHeading = line.match(/^\d+\.\s+\*\*(.+?)\*\*$/);
    if (itemHeading) {
      flush();
      const full = itemHeading[1].trim();
      const codeMatch = full.match(/^([A-Z]-\d+)\s+(.+)$/);
      if (!codeMatch) continue;
      current = {
        queuePrefix: "NOW",
        lane: currentLane || codeMatch[1].split("-")[0] || "",
        code: codeMatch[1],
        title: `NOW ${codeMatch[1]} ${codeMatch[2]}`,
      };
      continue;
    }

    if (!current) continue;

    const fieldMatch = line.match(/^- `([^`]+)`: (.+)$/);
    if (!fieldMatch) continue;
    const key = fieldMatch[1];
    const rawValue = fieldMatch[2].trim();
    const unquoted = rawValue.replace(/^`/, "").replace(/`$/, "");

    if (key === "project") current.projectSlug = unquoted;
    else if (key === "lane") current.lane = unquoted;
    else if (key === "autonomyTier") current.autonomyTier = unquoted;
    else if (key === "dataClass") current.dataClass = unquoted;
    else if (key === "approvalTriggers") current.approvalTriggers = unquoted;
    else if (key === "dependencies") {
      current.dependencies =
        unquoted.toLowerCase() === "none"
          ? []
          : unquoted.split(",").map((part) => part.trim()).filter(Boolean);
    } else if (key === "rollbackRequired") current.rollbackRequired = unquoted;
    else if (key === "successEvidence") current.successEvidence = unquoted;
  }

  flush();
  return specs;
}

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function normalizeProjectStatus(input?: string): ProjectStatus {
  const value = String(input || "").trim().toLowerCase();
  if (value.includes("active")) return ProjectStatus.ACTIVE;
  if (value.includes("done") || value.includes("complete")) return ProjectStatus.DONE;
  if (value.includes("paused") || value.includes("blocked")) return ProjectStatus.PAUSED;
  return ProjectStatus.DRAFT;
}

function initialTaskStatus(spec: PortfolioTaskSpec): TaskStatus {
  return spec.dependencies.length > 0 ? TaskStatus.BLOCKED : TaskStatus.QUEUE;
}

function isAutoDispatchEligible(spec: PortfolioTaskSpec) {
  return (
    spec.queuePrefix === "NOW" &&
    spec.autonomyTier === "draft-only" &&
    spec.dataClass === "internal" &&
    spec.approvalTriggers.trim().toLowerCase() === "none" &&
    spec.rollbackRequired.trim().toLowerCase() === "no"
  );
}

function buildInstructions(spec: PortfolioTaskSpec) {
  return [
    `Project: ${spec.projectSlug}`,
    `Lane: ${spec.lane}`,
    `Autonomy tier: ${spec.autonomyTier}`,
    `Data class: ${spec.dataClass}`,
    `Approval triggers: ${spec.approvalTriggers}`,
    `Dependencies: ${spec.dependencies.length ? spec.dependencies.join(", ") : "none"}`,
    `Rollback required: ${spec.rollbackRequired}`,
    `Success evidence: ${spec.successEvidence}`,
  ].join("\n");
}

export async function getPortfolioSyncControl(): Promise<PortfolioSyncControl> {
  const row = await db.systemStatus.findUnique({ where: { key: PORTFOLIO_SYNC_CONTROL_KEY } });
  const value = (row?.value ?? {}) as Record<string, unknown>;
  const enabled = typeof value.enabled === "boolean" ? value.enabled : true;
  return {
    enabled,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : row?.updatedAt?.toISOString(),
    updatedBy: typeof value.updatedBy === "string" ? value.updatedBy : undefined,
  };
}

export async function setPortfolioSyncControl(enabled: boolean, updatedBy = "operator") {
  const now = new Date().toISOString();
  const value = { enabled, updatedAt: now, updatedBy };
  await db.systemStatus.upsert({
    where: { key: PORTFOLIO_SYNC_CONTROL_KEY },
    create: { key: PORTFOLIO_SYNC_CONTROL_KEY, value },
    update: { value },
  });
  return value;
}

export async function getPortfolioSyncReport() {
  const row = await db.systemStatus.findUnique({ where: { key: PORTFOLIO_SYNC_REPORT_KEY } });
  return row?.value ?? null;
}

export async function runPortfolioSync(options?: { updatedBy?: string; force?: boolean }): Promise<PortfolioSyncReport> {
  const control = await getPortfolioSyncControl();
  if (!control.enabled && !options?.force) {
    const report: PortfolioSyncReport = {
      ranAt: new Date().toISOString(),
      sourcePath: PORTFOLIO_BOARD_PATH,
      taskPackPath: HOUSTON_TASK_PACK_NOW_PATH,
      controlEnabled: false,
      createdProjects: 0,
      reusedProjects: 0,
      createdTasks: 0,
      updatedTasks: 0,
      eligibleAutoDispatchTasks: 0,
      dependencyEdgesCreated: 0,
      dependencyEdgesReused: 0,
      skippedQueueItems: ["sync-paused-by-operator"],
      queueSummary: parseQueueSummary(safeRead(PORTFOLIO_BOARD_PATH)),
    };
    await db.systemStatus.upsert({
      where: { key: PORTFOLIO_SYNC_REPORT_KEY },
      create: { key: PORTFOLIO_SYNC_REPORT_KEY, value: report },
      update: { value: report },
    });
    return report;
  }

  const boardContents = safeRead(PORTFOLIO_BOARD_PATH);
  const packContents = safeRead(HOUSTON_TASK_PACK_NOW_PATH);
  const queueSummary = parseQueueSummary(boardContents);
  const nowSpecs = parseTaskPackNow(packContents);

  const report: PortfolioSyncReport = {
    ranAt: new Date().toISOString(),
    sourcePath: PORTFOLIO_BOARD_PATH,
    taskPackPath: HOUSTON_TASK_PACK_NOW_PATH,
    controlEnabled: true,
    createdProjects: 0,
    reusedProjects: 0,
    createdTasks: 0,
    updatedTasks: 0,
    eligibleAutoDispatchTasks: 0,
    dependencyEdgesCreated: 0,
    dependencyEdgesReused: 0,
    skippedQueueItems: [],
    queueSummary,
  };

  const projectCache = new Map<string, { id: string; slug: string }>();
  for (const spec of nowSpecs) {
    const existingProject = await db.project.findUnique({
      where: { slug: spec.projectSlug },
      select: { id: true, slug: true },
    });

    if (existingProject) {
      projectCache.set(spec.projectSlug, existingProject);
      report.reusedProjects += 1;
      continue;
    }

    const createdProject = await db.project.create({
      data: {
        slug: spec.projectSlug,
        title: humanizeSlug(spec.projectSlug),
        status: normalizeProjectStatus("active"),
        metadata: {
          source: "portfolio-sync",
          updatedBy: options?.updatedBy ?? "portfolio-sync",
        },
      },
      select: { id: true, slug: true },
    });
    projectCache.set(spec.projectSlug, createdProject);
    report.createdProjects += 1;
  }

  const taskCache = new Map<string, { id: string; status: TaskStatus }>();
  for (const spec of nowSpecs) {
    const project = projectCache.get(spec.projectSlug);
    if (!project) {
      report.skippedQueueItems.push(spec.title);
      continue;
    }

    const autoDispatch = isAutoDispatchEligible(spec);
    if (autoDispatch) {
      report.eligibleAutoDispatchTasks += 1;
    }

    const existingTask =
      (await db.task.findFirst({
        where: { title: spec.title },
        select: { id: true, status: true, title: true },
      })) ??
      (await db.task.findFirst({
        where: {
          title: {
            startsWith: `${spec.queuePrefix} ${spec.code} `,
          },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, title: true },
      }));

    if (existingTask) {
      await db.task.update({
        where: { id: existingTask.id },
        data: {
          title: spec.title,
          projectId: project.id,
          autoDispatch,
          autonomyTier: spec.autonomyTier,
          dataClass: spec.dataClass,
          instructionsOverride: buildInstructions(spec),
        },
      });
      taskCache.set(spec.title, { id: existingTask.id, status: existingTask.status as TaskStatus });
      report.updatedTasks += 1;
      continue;
    }

    const createdTask = await db.task.create({
      data: {
        title: spec.title,
        projectId: project.id,
        status: initialTaskStatus(spec),
        autoDispatch,
        autonomyTier: spec.autonomyTier,
        dataClass: spec.dataClass,
        instructionsOverride: buildInstructions(spec),
      },
      select: { id: true, status: true },
    });

    await db.taskEvent.create({
      data: {
        taskId: createdTask.id,
        type: TaskEventType.CREATED,
        message: "Created by portfolio sync",
        metadata: {
          source: "portfolio-sync",
          queuePrefix: "NOW",
          lane: spec.lane,
          code: spec.code,
        },
      },
    });

    taskCache.set(spec.title, { id: createdTask.id, status: createdTask.status as TaskStatus });
    report.createdTasks += 1;
  }

  for (const spec of nowSpecs) {
    const task = taskCache.get(spec.title);
    if (!task) continue;

    for (const depCode of spec.dependencies) {
      const depTitle = nowSpecs.find((candidate) => candidate.code === depCode)?.title;
      const depTask = depTitle ? taskCache.get(depTitle) : null;
      if (!depTask) continue;

      const existingDependency = await db.taskDependency.findFirst({
        where: {
          taskId: task.id,
          dependsOnTaskId: depTask.id,
        },
        select: { id: true },
      });

      if (!existingDependency) {
        await db.taskDependency.create({
          data: {
            taskId: task.id,
            dependsOnTaskId: depTask.id,
          },
        });
        report.dependencyEdgesCreated += 1;
      } else {
        report.dependencyEdgesReused += 1;
      }
    }
  }

  await db.systemStatus.upsert({
    where: { key: PORTFOLIO_SYNC_REPORT_KEY },
    create: { key: PORTFOLIO_SYNC_REPORT_KEY, value: report },
    update: { value: report },
  });

  return report;
}
