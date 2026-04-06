"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";
import MarkdownPreview from "@/components/MarkdownPreview";
import MarkdownEditor from "@/components/MarkdownEditor";

const DOC_MAP: Record<string, string> = {
  project: "PROJECT",
  "action-plan": "ACTION_PLAN",
  notes: "NOTES",
};

export default function ProjectDocPage() {
  const params = useParams();
  const slug = params.slug as string;
  const doc = params.doc as string;
  const [projectId, setProjectId] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState(doc);
  const [isEditMode, setIsEditMode] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const projectRes = await fetch(`/api/v1/projects`, { credentials: "include" });
        const projectData = await projectRes.json();
        const project = (projectData.data ?? []).find((item: any) => item.slug === slug);
        if (!project) throw new Error("Project not found");
        setProjectId(project.id);
        const docsRes = await fetch(`/api/v1/project-docs?projectId=${project.id}`, { credentials: "include" });
        const docsData = await docsRes.json();
        const match = (docsData.data ?? []).find((entry: any) => entry.kind === DOC_MAP[doc]);
        if (!match) throw new Error("Document not found");
        setDocId(match.id);
        setVersion(match.version);
        setContent(match.contentMarkdown ?? "");
        setTitle(match.title ?? doc);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load document");
      }
    };
    load();
  }, [doc, slug]);

  async function save(nextContent: string) {
    if (!docId || version === null) throw new Error("Document not loaded");
    const res = await fetch(`/api/v1/project-docs/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ version, contentMarkdown: nextContent, editedBy: "houston-ui", editReason: `Edited ${doc}` }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to save document");
    setContent(data.data.contentMarkdown ?? nextContent);
    setVersion(data.data.version ?? version + 1);
    setIsEditMode(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Project Document</p>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{slug}</p>
          </div>
          <div className="flex gap-2">
            <a href={`/projects/${slug}`} className="rounded-md border px-3 py-2 text-sm">Project</a>
            {projectId ? <button onClick={() => setIsEditMode((current) => !current)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">{isEditMode ? "Preview" : "Edit"}</button> : null}
          </div>
        </div>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {isEditMode ? (
          <MarkdownEditor slug={slug} doc={doc} initialContent={content} onClose={() => setIsEditMode(false)} onSave={save} title={title} />
        ) : (
          <div className="rounded-lg border bg-card p-6">
            <MarkdownPreview content={content} />
          </div>
        )}
      </div>
    </div>
  );
}
