"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/nav";

type Run = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  errorText?: string | null;
  project?: { id: string; slug: string; title: string } | null;
  workItem?: { id: string; title: string; type: string; autonomyLevel?: string; autonomousEligible?: boolean } | null;
  events?: Array<{ eventType: string; payload?: Record<string, unknown> | null }>;
};

type Project = { id: string; slug: string; title?: string; name?: string };

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [pilotOnly, setPilotOnly] = useState(true);
  const [autonomousOnly, setAutonomousOnly] = useState(false);
  const [error, setError] = useState("");
  const [projectWarning, setProjectWarning] = useState("");

  useEffect(() => {
    const load = async () => {
      setError("");
      setProjectWarning("");

      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (status) params.set("status", status);
      if (pilotOnly) params.set("pilotOnly", "true");
      if (autonomousOnly) params.set("autonomousOnly", "true");

      try {
        const runRes = await fetch(`/api/v1/execution-runs?${params.toString()}`, { credentials: "include" });
        if (runRes.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!runRes.ok) {
          const maybeJson = await runRes.json().catch(() => null);
          const msg = typeof maybeJson?.error === "string" ? maybeJson.error : "";
          throw new Error(msg || `Failed to load runs (${runRes.status})`);
        }
        const runData = await runRes.json();
        setRuns(runData.data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load runs");
      }

      try {
        const projectRes = await fetch("/api/v1/projects", { credentials: "include" });
        if (projectRes.status === 401) {
          setProjectWarning("Session expired. Please sign in again.");
          return;
        }
        if (!projectRes.ok) {
          setProjectWarning("Project filter temporarily unavailable.");
          setProjects([]);
          return;
        }
        const projectData = await projectRes.json();
        setProjects(projectData.data ?? []);
      } catch {
        setProjectWarning("Project filter temporarily unavailable.");
        setProjects([]);
      }
    };
    void load();
  }, [projectId, status, pilotOnly, autonomousOnly]);

  const grouped = useMemo(() => {
    return runs.reduce<Record<string, number>>((acc, run) => {
      acc[run.status] = (acc[run.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [runs]);

  const pilotSummary = useMemo(() => {
    const latestByTitle = new Map<string, Run>();
    for (const run of runs) {
      const title = run.workItem?.title;
      if (!title) continue;
      if (!latestByTitle.has(title)) latestByTitle.set(title, run);
    }
    return Array.from(latestByTitle.entries()).map(([title, run]) => ({
      title,
      status: run.status,
      projectTitle: run.project?.title ?? run.project?.slug ?? "-",
      updatedAt: run.updatedAt,
      errorText: run.errorText,
      id: run.id,
    }));
  }, [runs]);

  const recentFailedAutonomous = useMemo(() => {
    return runs
      .filter((run) => run.status === "FAILED")
      .slice(0, 8)
      .map((run) => {
        const terminalEvent = [...(run.events ?? [])].reverse().find((event) => event.eventType === "FAILED" || event.eventType === "COMPLETED");
        const payload = (terminalEvent?.payload ?? {}) as Record<string, unknown>;
        const stderrPreview = typeof payload.stderrPreview === "string" ? payload.stderrPreview.trim() : "";
        const stdoutPreview = typeof payload.stdoutPreview === "string" ? payload.stdoutPreview.trim() : "";
        return {
          id: run.id,
          title: run.workItem?.title ?? run.id,
          projectTitle: run.project?.title ?? run.project?.slug ?? "-",
          createdAt: run.createdAt,
          preview: stderrPreview || stdoutPreview || run.errorText || "No failure preview captured.",
        };
      });
  }, [runs]);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Runs</h1>
            <p className="text-sm text-muted-foreground">Execution runs, with pilot monitoring filters enabled.</p>
            <p className="text-xs text-muted-foreground mt-1">Autonomous work is now explicit opt-in and can be filtered separately from pilot-only runs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select className="rounded-md border bg-background px-3 py-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.title ?? project.name ?? project.slug}</option>
              ))}
            </select>
            <select className="rounded-md border bg-background px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="ACCEPTED">accepted</option>
              <option value="RUNNING">running</option>
              <option value="WAITING_APPROVAL">waiting approval</option>
              <option value="COMPLETED">completed</option>
              <option value="FAILED">failed</option>
              <option value="CANCELLED">cancelled</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={pilotOnly} onChange={(e) => setPilotOnly(e.target.checked)} />
              Pilot runs only
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={autonomousOnly} onChange={(e) => setAutonomousOnly(e.target.checked)} />
              Autonomous only
            </label>
          </div>
        </div>

        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {projectWarning ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{projectWarning}</div> : null}

        <div className="flex flex-wrap gap-2">
          {Object.entries(grouped).map(([key, count]) => (
            <span key={key} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              {key.toLowerCase()}: {count}
            </span>
          ))}
        </div>

        {pilotOnly ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Early pilot failures may be bring-up noise from guardrail/reporting rollout. Use the latest run for each pilot as the current signal.
          </div>
        ) : null}

        {pilotOnly && pilotSummary.length > 0 ? (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground">Latest Pilot Status</h2>
              <p className="text-xs text-muted-foreground">Most recent run per pilot work item.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {pilotSummary.map((pilot) => (
                <a key={pilot.title} href={`/runs/${pilot.id}`} className="rounded-lg border p-3 hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{pilot.title}</p>
                      <p className="text-xs text-muted-foreground">{pilot.projectTitle}</p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {pilot.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Updated {new Date(pilot.updatedAt).toLocaleString()}</p>
                  {pilot.errorText ? <p className="mt-2 text-xs text-red-700 line-clamp-2">{pilot.errorText}</p> : null}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {recentFailedAutonomous.length > 0 ? (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground">Recent Failed Autonomous Runs</h2>
                <p className="text-xs text-muted-foreground">Latest failed draft-only runs with captured previews.</p>
              </div>
              {status !== "FAILED" ? (
                <button className="rounded-md border px-3 py-1.5 text-xs" onClick={() => setStatus("FAILED")}>
                  Filter failed
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {recentFailedAutonomous.map((run) => (
                <a key={run.id} href={`/runs/${run.id}`} className="rounded-lg border p-3 hover:bg-muted/40 space-y-2">
                  <div>
                    <p className="font-medium text-sm">{run.title}</p>
                    <p className="text-xs text-muted-foreground">{run.projectTitle}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</p>
                  <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px] text-muted-foreground">
                    {run.preview}
                  </pre>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border bg-card divide-y">
          {runs.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No runs found.</div>
          ) : (
            runs.map((run) => (
              <a key={run.id} href={`/runs/${run.id}`} className="block p-4 hover:bg-muted/40">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-medium">{run.workItem?.title ?? run.id}</p>
                    <p className="text-sm text-muted-foreground">
                      {run.project?.title ?? "-"} • {run.workItem?.type?.toLowerCase() ?? "run"}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {run.workItem?.autonomousEligible ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">autonomous</span> : null}
                      {run.workItem?.autonomyLevel ? <span>{run.workItem.autonomyLevel.toLowerCase()}</span> : null}
                    </div>
                    {run.errorText ? <p className="text-xs text-red-700">{run.errorText}</p> : null}
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{run.status.toLowerCase()}</p>
                    <p className="text-xs">{new Date(run.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
