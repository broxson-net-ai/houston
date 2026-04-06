"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/nav";

type BoardProject = {
  id: string;
  slug: string;
  title?: string;
  name?: string;
  status?: string;
};

type BoardWorkItem = {
  id: string;
  title: string;
  status: string;
  autonomyLevel?: string;
  autonomousEligible?: boolean;
  type?: string;
  priority?: number | null;
  blockedReasonCache?: {
    type?: string;
    message?: string;
    pausedReason?: string | null;
  } | null;
  project?: BoardProject | null;
  phase?: { id: string; title: string; phaseKey: string } | null;
  executionRuns?: Array<{ id: string; status: string; createdAt: string }>;
};

const COLUMNS = ["PLANNING", "READY", "BLOCKED", "IN_PROGRESS", "DONE"] as const;

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase();
}

function badgeClass(status: string) {
  if (status === "PLANNING") return "bg-stone-100 text-stone-800";
  if (status === "READY") return "bg-sky-100 text-sky-800";
  if (status === "BLOCKED") return "bg-amber-100 text-amber-800";
  if (status === "IN_PROGRESS") return "bg-blue-100 text-blue-800";
  if (status === "DONE") return "bg-emerald-100 text-emerald-800";
  return "bg-muted text-muted-foreground";
}

export default function BoardPage() {
  const [items, setItems] = useState<BoardWorkItem[]>([]);
  const [projects, setProjects] = useState<BoardProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [autonomousOnly, setAutonomousOnly] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const projectRes = await fetch("/api/v1/projects", { credentials: "include" });
      if (!projectRes.ok) throw new Error("Failed to load projects");
      const projectData = await projectRes.json();
      setProjects(projectData.data ?? []);
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (autonomousOnly) params.set("autonomousEligible", "true");
      const workItemRes = await fetch(`/api/v1/work-items${params.toString() ? `?${params.toString()}` : ""}`, {
        credentials: "include",
      });
      if (!workItemRes.ok) throw new Error("Failed to load board work items");
      const workItemData = await workItemRes.json();
      setItems(workItemData.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    }
  }, [autonomousOnly, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const source = new EventSource("/api/v1/events");
    const refresh = () => {
      load();
    };
    source.addEventListener("work-item.created", refresh);
    source.addEventListener("work-item.updated", refresh);
    source.addEventListener("project.paused", refresh);
    source.addEventListener("project.resumed", refresh);
    source.addEventListener("execution-run.created", refresh);
    source.addEventListener("approval-request.decided", refresh);
    return () => {
      source.close();
    };
  }, [load]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesProject = !projectId || item.project?.id === projectId;
      const matchesQuery =
        !normalizedQuery ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.project?.slug?.toLowerCase().includes(normalizedQuery) ||
        item.phase?.title?.toLowerCase().includes(normalizedQuery);
      return matchesProject && matchesQuery;
    });
  }, [items, projectId, query]);

  const grouped = useMemo(() => {
    const base: Record<string, BoardWorkItem[]> = {
      PLANNING: [],
      READY: [],
      BLOCKED: [],
      IN_PROGRESS: [],
      DONE: [],
    };

    for (const item of filtered) {
      if (!COLUMNS.includes(item.status as (typeof COLUMNS)[number])) continue;
      const key = item.status;
      base[key].push(item);
    }

    return base;
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Board</h1>
              <p className="text-sm text-muted-foreground">
                Control-plane work items grouped by planning and execution readiness.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                View-only board for now; drag-and-drop is not used in the control-plane flow.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Autonomous items are explicitly opt-in and marked below.
              </p>
            </div>
          <div className="flex flex-wrap gap-3">
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title ?? project.name ?? project.slug}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={autonomousOnly} onChange={(event) => setAutonomousOnly(event.target.checked)} />
              Autonomous only
            </label>
            <button className="rounded-md border px-3 py-2 text-sm" onClick={() => load()}>
              Refresh
            </button>
          </div>
        </div>

        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="grid gap-4 lg:grid-cols-5">
          {COLUMNS.map((column) => (
            <div key={column} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{statusLabel(column)}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {grouped[column].length}
                </span>
              </div>
              <div className="space-y-3">
                {grouped[column].map((item) => (
                  <div key={item.id} className="rounded-lg border bg-background p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <a href={`/work-items/${item.id}`} className="text-sm font-medium hover:underline">
                        {item.title}
                      </a>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {item.project ? <span>{item.project.title ?? item.project.name ?? item.project.slug}</span> : null}
                      {item.phase ? <span>{item.phase.title}</span> : null}
                      {item.type ? <span>{String(item.type).toLowerCase()}</span> : null}
                      {item.autonomousEligible ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] text-violet-800">autonomous</span> : null}
                      {item.autonomyLevel ? <span>{String(item.autonomyLevel).toLowerCase()}</span> : null}
                    </div>
                    {item.blockedReasonCache?.message ? (
                      <div className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        {item.blockedReasonCache.message}
                        {item.blockedReasonCache.pausedReason ? ` - ${item.blockedReasonCache.pausedReason}` : ""}
                      </div>
                    ) : null}
                    {item.executionRuns?.[0] ? (
                      <div className="text-xs text-muted-foreground">
                        Latest run: <a href={`/runs/${item.executionRuns[0].id}`} className="underline">{String(item.executionRuns[0].status).toLowerCase()}</a> at {new Date(item.executionRuns[0].createdAt).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                ))}
                {grouped[column].length === 0 ? <div className="text-xs text-muted-foreground">No items</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
