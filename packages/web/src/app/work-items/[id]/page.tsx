"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";

type WorkItem = {
  id: string;
  title: string;
  status: string;
  type: string;
  autonomyLevel: string;
  autonomousEligible?: boolean;
  descriptionMarkdown?: string | null;
  recommendedCapabilities?: string[] | null;
  recommendedSkills?: string[] | null;
  recommendedTools?: string[] | null;
  blockedReasonCache?: { message?: string; pausedReason?: string | null } | null;
  project?: { id: string; slug: string; title: string } | null;
  phase?: { id: string; title: string } | null;
  executionRuns?: Array<{ id: string; status: string; createdAt: string }>;
};

type Dependency = {
  id: string;
  fromSubjectId: string;
  toSubjectId: string;
  fromSubjectType: string;
  toSubjectType: string;
  edgeType: string;
  strength: string;
  reason?: string | null;
};

type WorkItemOption = { id: string; title: string; status: string };

function edgeSubjectLabel(edge: Dependency, options: WorkItemOption[], direction: "upstream" | "downstream") {
  const targetId = direction === "upstream" ? edge.fromSubjectId : edge.toSubjectId;
  const option = options.find((entry) => entry.id === targetId);
  return {
    id: targetId,
    title: option?.title ?? targetId,
    status: option?.status ?? null,
  };
}

export default function WorkItemDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [item, setItem] = useState<WorkItem | null>(null);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [workItemOptions, setWorkItemOptions] = useState<WorkItemOption[]>([]);
  const [newDependencyId, setNewDependencyId] = useState("");
  const [autonomousEligible, setAutonomousEligible] = useState(false);
  const [savingAutonomy, setSavingAutonomy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/v1/work-items/${id}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load work item");
        return res.json();
      })
      .then((data) => {
        setItem(data.data);
        setAutonomousEligible(Boolean(data.data?.autonomousEligible));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load work item"));
    fetch(`/api/v1/dependencies?subjectType=WORK_ITEM&subjectId=${encodeURIComponent(id)}`, { credentials: "include" })
      .then(async (res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => setDependencies(data.data ?? []))
      .catch(() => undefined);
    fetch(`/api/v1/work-items`, { credentials: "include" })
      .then(async (res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => setWorkItemOptions((data.data ?? []).map((entry: any) => ({ id: entry.id, title: entry.title, status: entry.status }))))
      .catch(() => undefined);
  }, [id]);

  const upstream = dependencies.filter((edge) => edge.toSubjectId === id);
  const downstream = dependencies.filter((edge) => edge.fromSubjectId === id);
  const graphNodes = [
    ...upstream.map((edge, index) => ({ id: `u-${index}`, label: edge.fromSubjectId, x: 80, y: 70 + index * 70, color: "#f59e0b" })),
    { id: "center", label: item?.title ?? id, x: 280, y: 140, color: "#2563eb" },
    ...downstream.map((edge, index) => ({ id: `d-${index}`, label: edge.toSubjectId, x: 480, y: 70 + index * 70, color: "#10b981" })),
  ];

  async function addDependency() {
    if (!newDependencyId) return;
    const res = await fetch(`/api/v1/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fromSubjectType: "WORK_ITEM",
        fromSubjectId: newDependencyId,
        toSubjectType: "WORK_ITEM",
        toSubjectId: id,
        edgeType: "BLOCKS",
        scope: "INTRA_PROJECT",
        strength: "HARD",
        reason: "Added from work-item detail",
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to add dependency");
      return;
    }
    const payload = await fetch(`/api/v1/dependencies?subjectType=WORK_ITEM&subjectId=${encodeURIComponent(id)}`, { credentials: "include" }).then((r) => r.json());
    setDependencies(payload.data ?? []);
    setNewDependencyId("");
  }

  async function removeDependency(edgeId: string) {
    const res = await fetch(`/api/v1/dependencies?id=${encodeURIComponent(edgeId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to remove dependency");
      return;
    }
    setDependencies((current) => current.filter((edge) => edge.id !== edgeId));
  }

  async function saveAutonomyEligibility() {
    if (!item) return;
    setSavingAutonomy(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/work-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ autonomousEligible }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update autonomy eligibility");
      setItem(data.data);
      setAutonomousEligible(Boolean(data.data?.autonomousEligible));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update autonomy eligibility");
    } finally {
      setSavingAutonomy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        {!item ? (
          <div className="text-sm text-muted-foreground">{error || "Loading work item..."}</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Work Item</p>
                <h1 className="text-3xl font-bold">{item.title}</h1>
                <p className="text-sm text-muted-foreground">
                  {item.type.toLowerCase()} - {item.status.toLowerCase()}
                </p>
              </div>
              <div className="flex gap-2">
                <a href="/board" className="rounded-md border px-3 py-2 text-sm">Board</a>
                {item.project ? <a href={`/projects/${item.project.slug}`} className="rounded-md border px-3 py-2 text-sm">Project</a> : null}
              </div>
            </div>

            {item.blockedReasonCache?.message ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {item.blockedReasonCache.message}
                {item.blockedReasonCache.pausedReason ? ` - ${item.blockedReasonCache.pausedReason}` : ""}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Project</p>
                <p className="text-sm font-medium">{item.project?.title ?? "-"}</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Phase</p>
                <p className="text-sm font-medium">{item.phase?.title ?? "-"}</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Latest Run</p>
                <p className="text-sm font-medium">{item.executionRuns?.[0]?.status?.toLowerCase() ?? "none"}</p>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground">Autonomy</h2>
                  <p className="text-sm text-muted-foreground">
                    Opt-in control for unattended draft-only execution. Autonomy also still requires `READY` and `DRAFT_ONLY`.
                  </p>
                </div>
                <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {item.autonomyLevel.toLowerCase()} {item.autonomousEligible ? "- eligible" : "- not eligible"}
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={autonomousEligible}
                  onChange={(e) => setAutonomousEligible(e.target.checked)}
                  disabled={item.autonomyLevel !== "DRAFT_ONLY"}
                />
                Enable unattended autonomous pickup for this work item
              </label>

              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p>Promotion checklist:</p>
                <p>- clear draft-only output shape</p>
                <p>- low-risk, no irreversible external side effects</p>
                <p>- guardrails/approvals already enforced where needed</p>
                <p>- at least a plausible operator review path if the run fails</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={saveAutonomyEligibility}
                  disabled={savingAutonomy || item.autonomyLevel !== "DRAFT_ONLY"}
                  className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingAutonomy ? "Saving..." : "Save autonomy setting"}
                </button>
                {item.autonomyLevel !== "DRAFT_ONLY" ? (
                  <p className="text-xs text-muted-foreground self-center">Only `DRAFT_ONLY` items can be marked autonomous-eligible.</p>
                ) : null}
              </div>
            </div>

            {item.descriptionMarkdown ? (
              <div className="rounded-lg border bg-card p-5 space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">Description</h2>
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{item.descriptionMarkdown}</pre>
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">Recommended Capabilities</h2>
                {(item.recommendedCapabilities ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(item.recommendedCapabilities ?? []).map((entry) => (
                      <span key={entry} className="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-800">{entry}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-lg border bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">Recommended Skills / Tools</h2>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Skills</p>
                    <p>{(item.recommendedSkills ?? []).join(", ") || "None"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tools</p>
                    <p>{(item.recommendedTools ?? []).join(", ") || "None"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Dependency Map</h2>
              <div className="flex gap-2">
                <select className="rounded-md border bg-background px-3 py-2 text-sm" value={newDependencyId} onChange={(e) => setNewDependencyId(e.target.value)}>
                  <option value="">Add blocker</option>
                  {workItemOptions.filter((option) => option.id !== id).map((option) => (
                    <option key={option.id} value={option.id}>{option.status.toLowerCase()} - {option.title}</option>
                  ))}
                </select>
                <button onClick={addDependency} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Add</button>
              </div>
              <div className="overflow-auto rounded-md border bg-background p-3">
                <svg width="560" height={Math.max(220, graphNodes.length * 70)} viewBox={`0 0 560 ${Math.max(220, graphNodes.length * 70)}`} className="max-w-full">
                  {upstream.map((_, index) => (
                    <line key={`ul-${index}`} x1="140" y1={85 + index * 70} x2="240" y2="145" stroke="#f59e0b" strokeWidth="2" />
                  ))}
                  {downstream.map((_, index) => (
                    <line key={`dl-${index}`} x1="320" y1="145" x2="420" y2={85 + index * 70} stroke="#10b981" strokeWidth="2" />
                  ))}
                  {graphNodes.map((node) => (
                    <g key={node.id}>
                      <rect x={node.x - 55} y={node.y - 18} rx="10" ry="10" width="110" height="36" fill={node.color} opacity="0.15" stroke={node.color} />
                      <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize="11" fill="#1f2937">
                        {node.label.length > 20 ? `${node.label.slice(0, 20)}...` : node.label}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border bg-background p-3 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Direct blockers</h3>
                  {upstream.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No direct blockers.</p>
                  ) : (
                    <div className="space-y-2">
                      {upstream.map((edge) => {
                        const subject = edgeSubjectLabel(edge, workItemOptions, "upstream");
                        return (
                          <div key={`direct-upstream-${edge.id}`} className="rounded-md border px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <a href={`/work-items/${subject.id}`} className="font-medium hover:underline">
                                {subject.title}
                              </a>
                              {subject.status ? <span className="text-xs text-muted-foreground">{subject.status.toLowerCase()}</span> : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {edge.edgeType.toLowerCase()} - {edge.strength.toLowerCase()}
                            </p>
                            {edge.reason ? <p className="mt-1 text-xs text-muted-foreground">{edge.reason}</p> : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="rounded-md border bg-background p-3 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Direct dependents</h3>
                  {downstream.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No direct dependents.</p>
                  ) : (
                    <div className="space-y-2">
                      {downstream.map((edge) => {
                        const subject = edgeSubjectLabel(edge, workItemOptions, "downstream");
                        return (
                          <div key={`direct-downstream-${edge.id}`} className="rounded-md border px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <a href={`/work-items/${subject.id}`} className="font-medium hover:underline">
                                {subject.title}
                              </a>
                              {subject.status ? <span className="text-xs text-muted-foreground">{subject.status.toLowerCase()}</span> : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {edge.edgeType.toLowerCase()} - {edge.strength.toLowerCase()}
                            </p>
                            {edge.reason ? <p className="mt-1 text-xs text-muted-foreground">{edge.reason}</p> : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">Blockers</h2>
                {upstream.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upstream blockers.</p>
                ) : (
                  <div className="space-y-2">
                    {upstream.map((edge) => (
                      <div key={edge.id} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{edge.edgeType.toLowerCase()}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{edge.strength.toLowerCase()}</span>
                            <button onClick={() => removeDependency(edge.id)} className="text-xs text-red-600 hover:underline">Remove</button>
                          </div>
                        </div>
                        {(() => {
                          const subject = edgeSubjectLabel(edge, workItemOptions, "upstream");
                          return (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {edge.fromSubjectType} {subject.title}
                              {subject.status ? ` (${subject.status.toLowerCase()})` : ""}
                            </p>
                          );
                        })()}
                        {edge.reason ? <p className="mt-2 text-xs text-muted-foreground">{edge.reason}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-lg border bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">Downstream Impact</h2>
                {downstream.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No dependent work items.</p>
                ) : (
                  <div className="space-y-2">
                    {downstream.map((edge) => (
                      <div key={edge.id} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{edge.edgeType.toLowerCase()}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{edge.strength.toLowerCase()}</span>
                            <button onClick={() => removeDependency(edge.id)} className="text-xs text-red-600 hover:underline">Remove</button>
                          </div>
                        </div>
                        {(() => {
                          const subject = edgeSubjectLabel(edge, workItemOptions, "downstream");
                          return (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {edge.toSubjectType} {subject.title}
                              {subject.status ? ` (${subject.status.toLowerCase()})` : ""}
                            </p>
                          );
                        })()}
                        {edge.reason ? <p className="mt-2 text-xs text-muted-foreground">{edge.reason}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {item.executionRuns && item.executionRuns.length > 0 ? (
              <div className="rounded-lg border bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">Execution Runs</h2>
                <div className="space-y-2">
                  {item.executionRuns.map((run) => (
                    <a key={run.id} href={`/runs/${run.id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
                      <span>{run.status.toLowerCase()}</span>
                      <span className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
