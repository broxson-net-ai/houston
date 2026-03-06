"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MarkdownPreview from "@/components/MarkdownPreview";
import MarkdownEditor from "@/components/MarkdownEditor";
import type { ProjectSummary } from "@/lib/projects";

const DOC_LABELS = {
  project: "Project Doc",
  actionPlan: "Action Plan",
  notes: "Notes",
} as const;

type ProjectDocType = keyof typeof DOC_LABELS;

function badgeColor(status?: string) {
  if (!status) return "bg-muted text-muted-foreground";
  const value = status.toLowerCase();
  if (value.includes("paused")) return "bg-yellow-100 text-yellow-800";
  if (value.includes("done") || value.includes("complete"))
    return "bg-emerald-100 text-emerald-800";
  if (value.includes("active")) return "bg-blue-100 text-blue-800";
  return "bg-muted text-muted-foreground";
}

export default function ProjectsView({ projects: initialProjects }: { projects: ProjectSummary[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>(initialProjects);
  const [modalProject, setModalProject] = useState<ProjectSummary | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<ProjectDocType | null>(null);
  const [docContent, setDocContent] = useState("");
  const [docMtime, setDocMtime] = useState<number | undefined>();
  const [loadingContent, setLoadingContent] = useState(false);
  const [docError, setDocError] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Auto-refresh projects every 30 seconds
  useEffect(() => {
    const refreshProjects = async () => {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const data = await res.json();
        setProjects(data.projects);
        setLastUpdated(new Date());
      } catch {
        // Silently fail - polling will retry
      }
    };

    // Initial refresh check after mount
    refreshProjects();

    // Poll every 30 seconds
    const interval = setInterval(refreshProjects, 30000);

    return () => clearInterval(interval);
  }, []);

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

  async function viewDoc(project: ProjectSummary, doc: ProjectDocType) {
    setModalProject(project);
    setSelectedDoc(doc);
    setLoadingContent(true);
    setDocError("");
    setDocContent("");
    setDocMtime(undefined);
    setIsEditMode(false);

    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project.slug)}/doc?doc=${encodeURIComponent(doc)}`
      );
      if (!res.ok) throw new Error("Failed to load project document");
      const data = await res.json();
      setDocContent(data.content ?? "");
      setDocMtime(data.mtime);
    } catch (err) {
      console.error("Failed to load project document:", err);
      setDocError("Failed to load project document");
    } finally {
      setLoadingContent(false);
    }
  }

  async function saveDoc(content: string) {
    if (!modalProject || !selectedDoc) {
      throw new Error("No project or document selected");
    }

    const res = await fetch(
      `/api/projects/${encodeURIComponent(modalProject.slug)}/doc?doc=${encodeURIComponent(selectedDoc)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          expectedMtime: docMtime,
        }),
      }
    );

    if (!res.ok) {
      const data = await res.json();
      if (data.conflict) {
        throw new Error("File was modified externally. Please reload from disk or discard draft.");
      }
      throw new Error(data.error || "Failed to save document");
    }

    // Reload the document after successful save
    await viewDoc(modalProject, selectedDoc);
  }

  function closeDocModal() {
    setModalProject(null);
    setSelectedDoc(null);
    setDocContent("");
    setDocMtime(undefined);
    setDocError("");
    setIsEditMode(false);
    setLoadingContent(false);
  }

  function enterEditMode() {
    setIsEditMode(true);
  }

  function exitEditMode() {
    setIsEditMode(false);
  }

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

      {lastUpdated && (
        <p className="text-xs text-muted-foreground">
          Auto-refreshed: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

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
                <button
                  type="button"
                  onClick={() => viewDoc(project, "project")}
                  className="text-primary hover:underline"
                >
                  Project
                </button>
              ) : null}
              {project.links.actionPlan ? (
                <button
                  type="button"
                  onClick={() => viewDoc(project, "actionPlan")}
                  className="text-primary hover:underline"
                >
                  Action Plan
                </button>
              ) : null}
              {project.links.notes ? (
                <button
                  type="button"
                  onClick={() => viewDoc(project, "notes")}
                  className="text-primary hover:underline"
                >
                  Notes
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {modalProject && selectedDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeDocModal}
        >
          <div
            className="max-h-[80vh] w-full max-w-6xl overflow-auto rounded-lg border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {isEditMode ? (
              <MarkdownEditor
                slug={modalProject.slug}
                doc={selectedDoc}
                initialContent={docContent}
                onClose={exitEditMode}
                onSave={saveDoc}
                title={DOC_LABELS[selectedDoc]}
              />
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold font-mono">{DOC_LABELS[selectedDoc]}</h2>
                    <p className="text-sm text-muted-foreground font-mono">
                      {modalProject.slug} / {DOC_LABELS[selectedDoc]}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={enterEditMode}
                      disabled={loadingContent}
                      className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={closeDocModal}
                      className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
                    >
                      Close
                    </button>
                  </div>
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
