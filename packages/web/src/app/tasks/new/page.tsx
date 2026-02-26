"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";

type Agent = { id: string; name: string };

export default function NewTaskPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState({
    title: "",
    agentId: "",
    dueAt: "",
    instructionsOverride: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/agents").then((r) => r.json()).then(setAgents);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        agentId: form.agentId || null,
        dueAt: form.dueAt || null,
        instructionsOverride: form.instructionsOverride || null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "An error occurred");
      return;
    }

    window.location.href = "/board";
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="container mx-auto px-4 py-6 max-w-lg">
        <div className="flex items-center gap-4 mb-6">
          <a href="/board" className="text-sm text-muted-foreground hover:text-primary">
            ← Back to Board
          </a>
        </div>
        <h1 className="text-2xl font-bold mb-6">New Task</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1">
              Title *
            </label>
            <input
              id="title"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div>
            <label htmlFor="agentId" className="block text-sm font-medium mb-1">
              Agent
            </label>
            <select
              id="agentId"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              value={form.agentId}
              onChange={(e) => setForm({ ...form, agentId: e.target.value })}
            >
              <option value="">None</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dueAt" className="block text-sm font-medium mb-1">
              Due At
            </label>
            <input
              id="dueAt"
              type="datetime-local"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="instructions" className="block text-sm font-medium mb-1">
              Instructions (override)
            </label>
            <textarea
              id="instructions"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              rows={5}
              value={form.instructionsOverride}
              onChange={(e) =>
                setForm({ ...form, instructionsOverride: e.target.value })
              }
              placeholder="Optional: override template instructions"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Task"}
            </button>
            <a
              href="/board"
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
