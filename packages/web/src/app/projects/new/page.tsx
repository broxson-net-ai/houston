"use client";

import { useState } from "react";
import { Nav } from "@/components/nav";

export default function NewProjectPage() {
  const [form, setForm] = useState({
    title: "",
    status: "draft",
    owner: "",
    summary: "",
    idea: "",
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
    setForm((prev) => ({ ...prev, title: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body = {
      title: form.title,
      slug: slugify(form.title),
      status: form.status,
      owner: form.owner || undefined,
      summary: form.summary || undefined,
      idea: form.idea || undefined,
    };

    try {
      const res = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      setLoading(false);

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "An error occurred");
        return;
      }

      const data = await res.json();
      window.location.href = data?.data?.slug ? `/projects/${data.data.slug}` : "/projects";
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
        <h1 className="text-2xl font-bold mb-2">Create Draft Project</h1>
        <p className="mb-6 text-sm text-muted-foreground">Capture an idea with minimum scaffolding and refine it inside the project control plane.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Project Title *
            </label>
            <input
              id="name"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              value={form.title}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="slug" className="block text-sm font-medium mb-1">
              Slug preview
            </label>
            <input
              id="slug"
              className="w-full px-3 py-2 border rounded-md text-sm bg-muted"
              value={slugify(form.title)}
              readOnly
              placeholder="auto-generated from title"
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
                <option value="archived">Archived</option>
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
            <label htmlFor="idea" className="block text-sm font-medium mb-1">
              Initial Idea
            </label>
            <textarea
              id="idea"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              rows={6}
              value={form.idea}
              onChange={(e) => setForm({ ...form, idea: e.target.value })}
              placeholder='Example: "Eliza, create a draft project for taking over the world." Capture the idea, constraints, and first thoughts here.'
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
