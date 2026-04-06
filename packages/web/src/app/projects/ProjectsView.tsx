"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ControlPlaneProject = {
  id?: string;
  slug: string;
  title?: string;
  name?: string;
  status?: string;
  owner?: string;
  updatedAt?: string;
  lastUpdated?: string;
  summary?: string;
  defaultTrustMode?: string;
  docMode?: string;
  phases?: Array<{ id: string; title: string; status: string }>;
  _count?: { docs?: number; phases?: number; workItems?: number; realityAudits?: number };
  workItemStatusCounts?: Record<string, number>;
};

function badgeColor(status?: string) {
  if (!status) return "bg-muted text-muted-foreground";
  const value = status.toLowerCase();
  if (value.includes("draft")) return "bg-stone-100 text-stone-800";
  if (value.includes("archiv")) return "bg-slate-200 text-slate-800";
  if (value.includes("paused")) return "bg-yellow-100 text-yellow-800";
  if (value.includes("active")) return "bg-blue-100 text-blue-800";
  return "bg-muted text-muted-foreground";
}

function normalizeProject(project: ControlPlaneProject): ControlPlaneProject {
  return {
    ...project,
    title: project.title ?? project.name ?? project.slug,
    status: project.status?.toLowerCase(),
  };
}

export default function ProjectsView({
  projects: initialProjects,
  apiBase = "/api/v1/projects",
}: {
  projects: ControlPlaneProject[];
  apiBase?: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [projects, setProjects] = useState<ControlPlaneProject[]>(initialProjects.map(normalizeProject));
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const refreshProjects = async () => {
      try {
        const params = new URLSearchParams();
        if (showArchived) params.set("includeArchived", "true");
        const res = await fetch(`${apiBase}${params.toString() ? `?${params.toString()}` : ""}`);
        if (!res.ok) return;
        const data = await res.json();
        setProjects((data.data ?? []).map(normalizeProject));
        setLastUpdated(new Date());
      } catch {
        // retry on next poll
      }
    };

    refreshProjects();
    const interval = setInterval(refreshProjects, 30000);
    return () => clearInterval(interval);
  }, [apiBase, showArchived]);

  const filters = useMemo(() => {
    return {
      statuses: Array.from(new Set(projects.map((project) => project.status).filter(Boolean) as string[])).sort(),
      owners: Array.from(new Set(projects.map((project) => project.owner).filter(Boolean) as string[])).sort(),
    };
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      const matchesQuery =
        !query ||
        String(project.title ?? "").toLowerCase().includes(query.toLowerCase()) ||
        project.slug.toLowerCase().includes(query.toLowerCase()) ||
        String(project.summary ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesStatus = !statusFilter || project.status === statusFilter;
      const matchesOwner = !ownerFilter || project.owner === ownerFilter;
      const matchesArchived = showArchived || project.status !== "archived";
      return matchesQuery && matchesStatus && matchesOwner && matchesArchived;
    });
  }, [ownerFilter, projects, query, showArchived, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Search projects"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option>
          {filters.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
          <option value="">All owners</option>
          {filters.owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          Show archived
        </label>
      </div>

      {lastUpdated ? <p className="text-xs text-muted-foreground">Auto-refreshed: {lastUpdated.toLocaleTimeString()}</p> : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((project) => (
          <div key={project.slug} className="flex h-full flex-col justify-between rounded-lg border bg-card p-5 shadow-sm">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/projects/${project.slug}`} className="text-lg font-semibold hover:underline">
                    {project.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">{project.slug}</p>
                </div>
                {project.status ? <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeColor(project.status)}`}>{project.status}</span> : null}
              </div>

              {project.summary ? <p className="text-sm text-muted-foreground">{project.summary}</p> : null}

              <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
                <div>Owner: {project.owner ?? "-"}</div>
                <div>Trust: {project.defaultTrustMode?.toLowerCase() ?? "strict"}</div>
                <div>Docs: {project._count?.docs ?? 0}</div>
                <div>Phases: {project._count?.phases ?? project.phases?.length ?? 0}</div>
                <div>Work items: {project._count?.workItems ?? 0}</div>
                <div>Audits: {project._count?.realityAudits ?? 0}</div>
              </div>

              {project.workItemStatusCounts ? (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(project.workItemStatusCounts).map(([key, value]) => (
                    <span key={key} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {key.toLowerCase()}: {value}
                    </span>
                  ))}
                </div>
              ) : null}

              {project.phases?.length ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Phases</p>
                  <div className="flex flex-wrap gap-2">
                    {project.phases.slice(0, 4).map((phase) => (
                      <span key={phase.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {phase.title}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link href={`/projects/${project.slug}`} className="text-primary hover:underline">Open</Link>
              <Link href={`/projects/${project.slug}/dependencies`} className="text-primary hover:underline">Dependencies</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
