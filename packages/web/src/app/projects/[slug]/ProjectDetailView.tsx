"use client";

import { useState } from "react";
import Link from "next/link";
import type { ProjectSummary } from "@/lib/projects";

const STATUS_OPTIONS = ["active", "paused", "done", "draft"];

export default function ProjectDetailView({ project }: { project: ProjectSummary }) {
  const [status, setStatus] = useState(project.status ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(next: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.slug}`, {
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
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

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

      {project.summary ? (
        <div className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Summary</h2>
          <p className="mt-2 text-sm">{project.summary}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4 text-sm">
        {project.links.project ? (
          <Link href={project.links.project} className="text-primary hover:underline">
            Project Doc
          </Link>
        ) : null}
        {project.links.actionPlan ? (
          <Link href={project.links.actionPlan} className="text-primary hover:underline">
            Action Plan
          </Link>
        ) : null}
        {project.links.notes ? (
          <Link href={project.links.notes} className="text-primary hover:underline">
            Notes
          </Link>
        ) : null}
      </div>
    </div>
  );
}
