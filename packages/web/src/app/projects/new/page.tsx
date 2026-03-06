"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    title: "",
    status: "draft",
    owner: "",
    summary: "",
    tags: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function handleNameChange(value: string) {
    setForm((prev) => ({ ...prev, name: value, slug: slugify(value), title: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body = {
      name: form.name,
      slug: form.slug,
      title: form.title,
      status: form.status,
      owner: form.owner || undefined,
      summary: form.summary || undefined,
      tags: form.tags ? form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
    };

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setLoading(false);

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "An error occurred");
        return;
      }

      window.location.href = "/projects";
    } catch (err) {
      setLoading(false);
      setError("Failed to create project");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="container mx-auto px-4 py-6 max-w-lg">
        <div className="mb-6">
          <a href="/projects" className="text-sm text-muted-foreground hover:text-primary">
            ← Back to Projects
          </a>
        </div>
        <h1 className="text-2xl font-bold mb-6">New Project</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Project Name *
            </label>
            <input
              id="name"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="slug" className="block text-sm font-medium mb-1">
              Slug (URL identifier)
            </label>
            <input
              id="slug"
              className="w-full px-3 py-2 border rounded-md text-sm bg-muted"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="auto-generated from name"
            />
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-medium mb-1">
              Status
            </label>
            <select
              id="status"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div>
            <label htmlFor="owner" className="block text-sm font-medium mb-1">
              Owner
            </label>
            <input
              id="owner"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
              placeholder="Optional: project owner"
            />
          </div>
          <div>
            <label htmlFor="summary" className="block text-sm font-medium mb-1">
              Summary
            </label>
            <textarea
              id="summary"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              rows={3}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="One-paragraph description of the project"
            />
          </div>
          <div>
            <label htmlFor="tags" className="block text-sm font-medium mb-1">
              Tags (comma-separated)
            </label>
            <input
              id="tags"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="e.g., infrastructure, automation, ops"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
            <a
              href="/projects"
              className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted"
            >
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
