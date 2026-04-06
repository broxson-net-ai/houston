"use client";

import { useEffect, useMemo, useState } from "react";
import MarkdownPreview from "@/components/MarkdownPreview";
import MarkdownEditor from "@/components/MarkdownEditor";

type ProjectSummary = {
  slug: string;
  name: string;
  status?: string;
  owner?: string;
  lastUpdated?: string;
  summary?: string;
  tags?: string[];
  links: { project?: string; actionPlan?: string; notes?: string };
  taskCount?: number;
  openTaskCount?: number;
  canArchive?: boolean;
  archiveBlockers?: string[];
  scheduleCount?: number;
  futureScheduleCount?: number;
  pendingActionCount?: number;
};

const STATUS_OPTIONS = ["active", "blocked", "paused", "done", "draft", "archived"];
const DOC_LABELS = {
  project: "Project Doc",
  actionPlan: "Action Plan",
  notes: "Notes",
} as const;

type ProjectDocType = keyof typeof DOC_LABELS;

export default function ProjectDetailView({
  project,
  controlPlaneProject,
  controlPlaneProjectId,
  updatePath,
}: {
  project: ProjectSummary;
  controlPlaneProject?: {
    id: string;
    slug: string;
    title: string;
    status: string;
    defaultTrustMode?: string;
    docMode?: string;
    summary?: string | null;
    phases?: Array<{ id: string; title: string; phaseKey: string; status: string; planningRequired: boolean }>;
    docs?: Array<{ id: string; kind: string; title: string; version: number }>;
    _count?: { docs?: number; phases?: number; workItems?: number; realityAudits?: number };
  };
  controlPlaneProjectId?: string;
  updatePath?: string;
}) {
  const [status, setStatus] = useState(project.status ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<ProjectDocType | null>(null);
  const [selectedControlPlaneDocId, setSelectedControlPlaneDocId] = useState<string | null>(null);
  const [selectedControlPlaneDocVersion, setSelectedControlPlaneDocVersion] = useState<number | null>(null);
  const [docContent, setDocContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [docError, setDocError] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [controlPlaneDocs, setControlPlaneDocs] = useState<Array<{ id: string; kind: string; title: string; contentMarkdown: string; version: number }>>([]);
  const [controlPlaneWorkItems, setControlPlaneWorkItems] = useState<Array<{ id: string; title: string; status: string; type: string; blockedReasonCache?: { message?: string } | null }>>([]);
  const [controlPlaneAudits, setControlPlaneAudits] = useState<Array<{ id: string; status: string; createdAt: string; findings: Array<{ id: string; result: string }> }>>([]);
  const [controlPlaneApprovals, setControlPlaneApprovals] = useState<Array<{ id: string; status: string; trigger: string; domain: string; requestedAt: string }>>([]);
  const [controlPlaneExports, setControlPlaneExports] = useState<Array<{ id: string; status: string; outputPath: string; createdAt: string }>>([]);
  const [newPhaseTitle, setNewPhaseTitle] = useState("");
  const [newWorkItemTitle, setNewWorkItemTitle] = useState("");
  const [newWorkItemType, setNewWorkItemType] = useState("PLANNING");
  const canArchive = project.canArchive || project.status === "archived";

  async function createRealityAudit() {
    if (!controlPlaneProjectId) return;
    setError(null);
    try {
      const res = await fetch(`/api/v1/reality-audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: controlPlaneProjectId,
          sourceType: "HYBRID",
          confidenceMode: "STRICT",
          summary: `Audit requested from project detail for ${project.name}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create audit");
      }
      const data = await res.json();
      setControlPlaneAudits((prev) => [data.data, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create audit");
    }
  }

  async function createExportSnapshot() {
    if (!controlPlaneProjectId) return;
    setError(null);
    try {
      const res = await fetch(`/api/v1/exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: controlPlaneProjectId,
          triggerType: "MANUAL_UI",
          requestedBy: "houston-ui",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create export snapshot");
      }
      const data = await res.json();
      setControlPlaneExports((prev) => [data.data, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create export snapshot");
    }
  }

  async function createPhase() {
    if (!controlPlaneProjectId || !newPhaseTitle.trim()) return;
    setError(null);
    try {
      const nextOrdinal = (controlPlaneProject?.phases?.length ?? 0) + 1;
      const res = await fetch(`/api/v1/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: controlPlaneProjectId,
          phaseKey: `phase-${nextOrdinal}`,
          title: newPhaseTitle.trim(),
          ordinal: nextOrdinal,
          planningRequired: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create phase");
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create phase");
    }
  }

  async function createWorkItem() {
    if (!controlPlaneProjectId || !newWorkItemTitle.trim()) return;
    setError(null);
    try {
      const res = await fetch(`/api/v1/work-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: controlPlaneProjectId,
          type: newWorkItemType,
          title: newWorkItemTitle.trim(),
          status: newWorkItemType === "PLANNING" ? "PLANNING" : "READY",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create work item");
      }
      const data = await res.json();
      setControlPlaneWorkItems((prev) => [data.data, ...prev]);
      setNewWorkItemTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create work item");
    }
  }

  useEffect(() => {
    if (!controlPlaneProjectId) return;

    const loadControlPlane = async () => {
      try {
        const [docsRes, itemsRes, auditsRes, approvalsRes, exportsRes] = await Promise.all([
          fetch(`/api/v1/project-docs?projectId=${encodeURIComponent(controlPlaneProjectId)}`),
          fetch(`/api/v1/work-items?projectId=${encodeURIComponent(controlPlaneProjectId)}`),
          fetch(`/api/v1/reality-audits?projectId=${encodeURIComponent(controlPlaneProjectId)}`),
          fetch(`/api/v1/approvals?subjectType=PROJECT&subjectId=${encodeURIComponent(controlPlaneProjectId)}`),
          fetch(`/api/v1/exports?projectId=${encodeURIComponent(controlPlaneProjectId)}`),
        ]);

        const [docsData, itemsData, auditsData, approvalsData, exportsData] = await Promise.all([
          docsRes.ok ? docsRes.json() : Promise.resolve({ data: [] }),
          itemsRes.ok ? itemsRes.json() : Promise.resolve({ data: [] }),
          auditsRes.ok ? auditsRes.json() : Promise.resolve({ data: [] }),
          approvalsRes.ok ? approvalsRes.json() : Promise.resolve({ data: [] }),
          exportsRes.ok ? exportsRes.json() : Promise.resolve({ data: [] }),
        ]);

        setControlPlaneDocs(docsData.data ?? []);
        setControlPlaneWorkItems(itemsData.data ?? []);
        setControlPlaneAudits(auditsData.data ?? []);
        setControlPlaneApprovals(approvalsData.data ?? []);
        setControlPlaneExports(exportsData.data ?? []);
      } catch {
        // keep lightweight and fail quietly for now
      }
    };

    loadControlPlane();
  }, [controlPlaneProjectId]);

  const controlPlaneSummary = useMemo(() => {
    return {
      planning: controlPlaneWorkItems.filter((item) => item.status === "PLANNING").length,
      blocked: controlPlaneWorkItems.filter((item) => item.status === "BLOCKED").length,
      activeApprovals: controlPlaneApprovals.filter((item) => item.status === "PENDING").length,
      acceptedAudits: controlPlaneAudits.filter((item) => item.status === "ACCEPTED").length,
    };
  }, [controlPlaneApprovals, controlPlaneAudits, controlPlaneWorkItems]);

  async function updateStatus(next: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(updatePath ?? `/api/projects/${project.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update status");
      }
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  async function viewDoc(doc: ProjectDocType) {
    setSelectedDoc(doc);
    setLoadingContent(true);
    setDocError("");
    setDocContent("");
    setIsEditMode(false);

    try {
      if (controlPlaneProjectId) {
        const kind = doc === "project" ? "PROJECT" : doc === "actionPlan" ? "ACTION_PLAN" : "NOTES";
        const match = controlPlaneDocs.find((entry) => entry.kind === kind);
        if (!match) throw new Error("Failed to load project document");
        setSelectedControlPlaneDocId(match.id);
        setSelectedControlPlaneDocVersion(match.version);
        setDocContent(match.contentMarkdown ?? "");
      } else {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(project.slug)}/doc?doc=${encodeURIComponent(doc)}`
        );
        if (!res.ok) throw new Error("Failed to load project document");
        const data = await res.json();
        setDocContent(data.content ?? "");
      }
    } catch (err) {
      console.error("Failed to load project document:", err);
      setDocError("Failed to load project document");
    } finally {
      setLoadingContent(false);
    }
  }

  function closeDocModal() {
    setSelectedDoc(null);
    setSelectedControlPlaneDocId(null);
    setSelectedControlPlaneDocVersion(null);
    setDocContent("");
    setDocError("");
    setLoadingContent(false);
    setIsEditMode(false);
  }

  async function saveControlPlaneDoc(content: string) {
    if (!selectedControlPlaneDocId || selectedControlPlaneDocVersion === null) {
      throw new Error("No project document selected");
    }

    const res = await fetch(`/api/v1/project-docs/${selectedControlPlaneDocId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        version: selectedControlPlaneDocVersion,
        contentMarkdown: content,
        editedBy: "houston-ui",
        editReason: `Edited from project detail for ${project.slug}`,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Failed to save project document");
    }

    setControlPlaneDocs((prev) =>
      prev.map((doc) =>
        doc.id === selectedControlPlaneDocId
          ? { ...doc, contentMarkdown: data.data.contentMarkdown, version: data.data.version }
          : doc
      )
    );
    setDocContent(data.data.contentMarkdown ?? content);
    setSelectedControlPlaneDocVersion(data.data.version ?? selectedControlPlaneDocVersion + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Project</p>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.slug}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Status</label>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={status}
            onChange={(event) => updateStatus(event.target.value)}
            disabled={saving}
          >
            <option value="">Unknown</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option} disabled={option === "archived" && !canArchive}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!canArchive ? (
        <p className="text-xs text-muted-foreground">
          Archive becomes available after status is done and there are no pending/future actions.
        </p>
      ) : null}

      {controlPlaneProjectId ? (
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Export Snapshots</h2>
            <button onClick={createExportSnapshot} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
              Create export
            </button>
          </div>
          {controlPlaneExports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No export snapshots recorded.</p>
          ) : (
            <div className="space-y-2">
              {controlPlaneExports.map((snapshot) => (
                <div key={snapshot.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{snapshot.status.toLowerCase()}</span>
                    <span className="text-xs text-muted-foreground">{new Date(snapshot.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{snapshot.outputPath}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tasks</p>
          <p className="text-2xl font-semibold">{project.taskCount ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Schedules</p>
          <p className="text-2xl font-semibold">{project.scheduleCount ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Last Updated</p>
          <p className="text-lg font-medium">
            {project.lastUpdated ?? "Unknown"}
          </p>
        </div>
      </div>

      {controlPlaneProjectId ? (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Planning Items</p>
            <p className="text-2xl font-semibold">{controlPlaneSummary.planning}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Blocked Items</p>
            <p className="text-2xl font-semibold">{controlPlaneSummary.blocked}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Pending Approvals</p>
            <p className="text-2xl font-semibold">{controlPlaneSummary.activeApprovals}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Accepted Audits</p>
            <p className="text-2xl font-semibold">{controlPlaneSummary.acceptedAudits}</p>
          </div>
        </div>
      ) : null}

      {controlPlaneProject ? (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Trust Mode</p>
            <p className="text-sm font-medium">{controlPlaneProject.defaultTrustMode?.toLowerCase() ?? "strict"}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Doc Mode</p>
            <p className="text-sm font-medium">{controlPlaneProject.docMode?.toLowerCase() ?? "managed"}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Phases</p>
            <p className="text-sm font-medium">{controlPlaneProject._count?.phases ?? controlPlaneProject.phases?.length ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Docs</p>
            <p className="text-sm font-medium">{controlPlaneProject._count?.docs ?? controlPlaneProject.docs?.length ?? 0}</p>
          </div>
        </div>
      ) : null}

      {(controlPlaneProject?.summary || project.summary) ? (
        <div className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Summary</h2>
          <p className="mt-2 text-sm">{controlPlaneProject?.summary ?? project.summary}</p>
        </div>
      ) : null}

      {controlPlaneProject?.phases?.length ? (
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Phases</h2>
            <a href={`/projects/${project.slug}/dependencies`} className="text-xs text-primary hover:underline">
              View dependency map
            </a>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {controlPlaneProject.phases.map((phase) => (
              <a key={phase.id} href={`/projects/${project.slug}/phases/${phase.id}`} className="block rounded-md border p-3 text-sm hover:bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{phase.title}</span>
                  <span className="text-xs text-muted-foreground">{phase.status.toLowerCase()}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{phase.phaseKey}</p>
                {phase.planningRequired ? <p className="mt-2 text-xs text-amber-700">Planning required</p> : null}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {controlPlaneProjectId ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Create Phase</h2>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Phase title"
              value={newPhaseTitle}
              onChange={(event) => setNewPhaseTitle(event.target.value)}
            />
            <button onClick={createPhase} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
              Add phase
            </button>
          </div>
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Create Work Item</h2>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Work item title"
              value={newWorkItemTitle}
              onChange={(event) => setNewWorkItemTitle(event.target.value)}
            />
            <div className="flex gap-2">
              <select className="rounded-md border bg-background px-3 py-2 text-sm" value={newWorkItemType} onChange={(event) => setNewWorkItemType(event.target.value)}>
                <option value="PLANNING">PLANNING</option>
                <option value="EXECUTION">EXECUTION</option>
                <option value="AUDIT">AUDIT</option>
                <option value="REVIEW">REVIEW</option>
              </select>
              <button onClick={createWorkItem} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
                Add work item
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {controlPlaneProjectId ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Reality Audits</h2>
              <button onClick={createRealityAudit} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
                Run audit
              </button>
            </div>
            {controlPlaneAudits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audits recorded.</p>
            ) : (
              controlPlaneAudits.map((audit) => (
                <a key={audit.id} href={`/audits/${audit.id}`} className="block rounded-md border p-3 text-sm hover:bg-muted/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{audit.status.toLowerCase()}</span>
                    <span className="text-xs text-muted-foreground">{new Date(audit.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Findings: {audit.findings?.length ?? 0}</p>
                </a>
              ))
            )}
          </div>
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Approval Activity</h2>
            {controlPlaneApprovals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approval requests recorded.</p>
            ) : (
              controlPlaneApprovals.map((approval) => (
                <div key={approval.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{approval.trigger}</span>
                    <span className="text-xs text-muted-foreground">{approval.status.toLowerCase()}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {approval.domain.toLowerCase()} - {new Date(approval.requestedAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {controlPlaneProjectId ? (
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Work Items</h2>
          {controlPlaneWorkItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No work items recorded.</p>
          ) : (
            <div className="space-y-3">
              {controlPlaneWorkItems.slice(0, 12).map((item) => (
                <div key={item.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.status.toLowerCase()}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.type.toLowerCase()}</p>
                  {item.blockedReasonCache?.message ? (
                    <p className="mt-2 text-xs text-amber-700">{item.blockedReasonCache.message}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4 text-sm">
        {controlPlaneProjectId || project.links.project ? (
          <a href={`/projects/docs/${project.slug}/project`} className="text-primary hover:underline">
            Project Doc
          </a>
        ) : null}
        {controlPlaneProjectId || project.links.actionPlan ? (
          <a href={`/projects/docs/${project.slug}/action-plan`} className="text-primary hover:underline">
            Action Plan
          </a>
        ) : null}
        {controlPlaneProjectId || project.links.notes ? (
          <a href={`/projects/docs/${project.slug}/notes`} className="text-primary hover:underline">
            Notes
          </a>
        ) : null}
      </div>

      {selectedDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeDocModal}
        >
          <div
            className="max-h-[80vh] w-full max-w-4xl overflow-auto rounded-lg border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold font-mono">{DOC_LABELS[selectedDoc]}</h2>
                <p className="text-sm text-muted-foreground font-mono">
                  {project.slug} / {DOC_LABELS[selectedDoc]}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDocModal}
                className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
              >
                Close
              </button>
            </div>
            {controlPlaneProjectId && !loadingContent && !docError ? (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditMode((current) => !current)}
                  className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
                >
                  {isEditMode ? "Preview" : "Edit"}
                </button>
              </div>
            ) : null}
            {loadingContent && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Loading...
              </div>
            )}
            {docError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {docError}
              </div>
            )}
            {!loadingContent && !docError && docContent && !isEditMode && (
              <MarkdownPreview content={docContent} />
            )}
            {!loadingContent && !docError && controlPlaneProjectId && isEditMode ? (
              <MarkdownEditor
                slug={project.slug}
                doc={selectedDoc}
                initialContent={docContent}
                onClose={() => setIsEditMode(false)}
                onSave={saveControlPlaneDoc}
                title={DOC_LABELS[selectedDoc]}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
