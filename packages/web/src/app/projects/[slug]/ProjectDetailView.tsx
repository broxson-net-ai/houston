"use client";

import { useState } from "react";
import MarkdownPreview from "@/components/MarkdownPreview";
import type { ProjectSummary } from "@/lib/projects";

const STATUS_OPTIONS = ["active", "paused", "done", "draft"];
const DOC_LABELS = {
  project: "Project Doc",
  actionPlan: "Action Plan",
  notes: "Notes",
} as const;

type ProjectDocType = keyof typeof DOC_LABELS;

export default function ProjectDetailView({ project }: { project: ProjectSummary }) {
  const [status, setStatus] = useState(project.status ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<ProjectDocType | null>(null);
  const [docContent, setDocContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [docError, setDocError] = useState("");

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

  async function viewDoc(doc: ProjectDocType) {
    setSelectedDoc(doc);
    setLoadingContent(true);
    setDocError("");
    setDocContent("");

    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project.slug)}/doc?doc=${encodeURIComponent(doc)}`
      );
      if (!res.ok) throw new Error("Failed to load project document");
      const data = await res.json();
      setDocContent(data.content ?? "");
    } catch (err) {
      console.error("Failed to load project document:", err);
      setDocError("Failed to load project document");
    } finally {
      setLoadingContent(false);
    }
  }

  function closeDocModal() {
    setSelectedDoc(null);
    setDocContent("");
    setDocError("");
    setLoadingContent(false);
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
          <button
            type="button"
            onClick={() => viewDoc("project")}
            className="text-primary hover:underline"
          >
            Project Doc
          </button>
        ) : null}
        {project.links.actionPlan ? (
          <button
            type="button"
            onClick={() => viewDoc("actionPlan")}
            className="text-primary hover:underline"
          >
            Action Plan
          </button>
        ) : null}
        {project.links.notes ? (
          <button
            type="button"
            onClick={() => viewDoc("notes")}
            className="text-primary hover:underline"
          >
            Notes
          </button>
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
            {!loadingContent && !docError && docContent && (
              <MarkdownPreview content={docContent} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
