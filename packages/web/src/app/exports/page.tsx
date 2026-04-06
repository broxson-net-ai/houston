"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";

type ExportSnapshot = {
  id: string;
  status: string;
  outputPath: string;
  createdAt: string;
  finishedAt?: string | null;
  errorText?: string | null;
  project?: { id: string; slug: string; title: string } | null;
};

type Project = { id: string; slug: string; title?: string; name?: string };

export default function ExportsPage() {
  const [exports, setExports] = useState<ExportSnapshot[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [exportsRes, projectsRes] = await Promise.all([
        fetch(`/api/v1/exports${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`, { credentials: "include" }),
        fetch(`/api/v1/projects`, { credentials: "include" }),
      ]);
      const [exportsData, projectsData] = await Promise.all([exportsRes.json(), projectsRes.json()]);
      setExports(exportsData.data ?? []);
      setProjects(projectsData.data ?? []);
    } catch {
      setError("Failed to load exports");
    }
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function createExport(targetProjectId?: string) {
    const res = await fetch(`/api/v1/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        projectId: targetProjectId || undefined,
        triggerType: "MANUAL_UI",
        requestedBy: "houston-ui",
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create export");
      return;
    }
    await load();
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Exports</h1>
            <p className="text-sm text-muted-foreground">Manage markdown snapshot exports and monitor background export jobs.</p>
          </div>
          <button onClick={() => createExport(projectId || undefined)} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
            Create export
          </button>
        </div>

        <div className="flex gap-3">
          <select className="rounded-md border bg-background px-3 py-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title ?? project.name ?? project.slug}</option>)}
          </select>
          <button onClick={() => load()} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Refresh</button>
        </div>

        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="space-y-3">
          {exports.map((snapshot) => (
            <div key={snapshot.id} className="rounded-lg border bg-card p-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{snapshot.project?.title ?? "All projects"}</p>
                  <p className="text-xs text-muted-foreground">{snapshot.status.toLowerCase()} · {new Date(snapshot.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  {snapshot.project ? <button onClick={() => createExport(snapshot.project?.id)} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">Retry</button> : null}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground break-all">{snapshot.outputPath}</p>
              {snapshot.finishedAt ? <p className="mt-1 text-xs text-muted-foreground">Finished {new Date(snapshot.finishedAt).toLocaleString()}</p> : null}
              {snapshot.errorText ? <p className="mt-2 text-xs text-red-600">{snapshot.errorText}</p> : null}
            </div>
          ))}
          {exports.length === 0 ? <p className="text-sm text-muted-foreground">No export snapshots recorded.</p> : null}
        </div>
      </div>
    </div>
  );
}
