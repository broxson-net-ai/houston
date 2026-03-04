"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ProjectSummary } from "@/lib/projects";

function badgeColor(status?: string) {
  if (!status) return "bg-muted text-muted-foreground";
  const value = status.toLowerCase();
  if (value.includes("paused")) return "bg-yellow-100 text-yellow-800";
  if (value.includes("done") || value.includes("complete"))
    return "bg-emerald-100 text-emerald-800";
  if (value.includes("active")) return "bg-blue-100 text-blue-800";
  return "bg-muted text-muted-foreground";
}

export default function ProjectsView({ projects }: { projects: ProjectSummary[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const filters = useMemo(() => {
    const statuses = new Set<string>();
    const owners = new Set<string>();
    const tags = new Set<string>();

    projects.forEach((project) => {
      if (project.status) statuses.add(project.status);
      if (project.owner) owners.add(project.owner);
      project.tags?.forEach((tag) => tags.add(tag));
    });

    return {
      statuses: Array.from(statuses).sort(),
      owners: Array.from(owners).sort(),
      tags: Array.from(tags).sort(),
    };
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      const matchesQuery =
        !query ||
        project.name.toLowerCase().includes(query.toLowerCase()) ||
        project.slug.toLowerCase().includes(query.toLowerCase()) ||
        project.summary?.toLowerCase().includes(query.toLowerCase());

      const matchesStatus = !statusFilter || project.status === statusFilter;
      const matchesOwner = !ownerFilter || project.owner === ownerFilter;
      const matchesTag =
        !tagFilter || project.tags?.some((tag) => tag === tagFilter);

      return matchesQuery && matchesStatus && matchesOwner && matchesTag;
    });
  }, [projects, query, statusFilter, ownerFilter, tagFilter]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Search projects"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">All statuses</option>
          {filters.statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={ownerFilter}
          onChange={(event) => setOwnerFilter(event.target.value)}
        >
          <option value="">All owners</option>
          {filters.owners.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
        >
          <option value="">All tags</option>
          {filters.tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((project) => (
          <div
            key={project.slug}
            className="flex h-full flex-col justify-between rounded-lg border bg-card p-5 shadow-sm"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    href={`/projects/${project.slug}`}
                    className="text-lg font-semibold hover:underline"
                  >
                    {project.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{project.slug}</p>
                </div>
                {project.status ? (
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${badgeColor(
                      project.status
                    )}`}
                  >
                    {project.status}
                  </span>
                ) : null}
              </div>
              {project.summary ? (
                <p className="text-sm text-muted-foreground">{project.summary}</p>
              ) : null}
              <div className="text-xs text-muted-foreground space-y-1">
                {project.owner ? <div>Owner: {project.owner}</div> : null}
                {project.lastUpdated ? (
                  <div>Last updated: {project.lastUpdated}</div>
                ) : null}
                {project.taskCount !== undefined ? (
                  <div>Tasks: {project.taskCount}</div>
                ) : null}
                {project.scheduleCount !== undefined ? (
                  <div>Schedules: {project.scheduleCount}</div>
                ) : null}
              </div>
              {project.tags?.length ? (
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {project.links.project ? (
                <Link
                  href={project.links.project}
                  className="text-primary hover:underline"
                >
                  Project
                </Link>
              ) : null}
              {project.links.actionPlan ? (
                <Link
                  href={project.links.actionPlan}
                  className="text-primary hover:underline"
                >
                  Action Plan
                </Link>
              ) : null}
              {project.links.notes ? (
                <Link
                  href={project.links.notes}
                  className="text-primary hover:underline"
                >
                  Notes
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
