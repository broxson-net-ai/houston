"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";

type Agent = { id: string; name: string };
type Project = { id: string; slug: string; name: string };
type TaskOption = { id: string; title: string; status: string };

export default function NewTaskPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskOptions, setTaskOptions] = useState<TaskOption[]>([]);
  const [form, setForm] = useState({
    title: "",
    agentId: "",
    projectId: "",
    dueAt: "",
    instructionsOverride: "",
    autoDispatch: false,
    dependencyTaskIds: [] as string[],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/tasks?view=list").then((r) => r.json()),
    ]).then(([agentsData, projectsData, tasksData]) => {
      if (agentsData.agents) setAgents(agentsData.agents);
      if (projectsData.projects) setProjects(projectsData.projects);
      if (tasksData.tasks) setTaskOptions(tasksData.tasks);
    });
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
        projectId: form.projectId || null,
        dueAt: form.dueAt || null,
        instructionsOverride: form.instructionsOverride || null,
        autoDispatch: form.autoDispatch,
        dependencyTaskIds: form.dependencyTaskIds,
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
            <label htmlFor="projectId" className="block text-sm font-medium mb-1">
              Project
            </label>
            <select
              id="projectId"
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.slug} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.autoDispatch}
                onChange={(e) => setForm({ ...form, autoDispatch: e.target.checked })}
              />
              Enable auto-dispatch (dependency-aware)
            </label>
          </div>
          <div>
            <label htmlFor="dependencyTaskIds" className="block text-sm font-medium mb-1">
              Depends on tasks
            </label>
            <select
              id="dependencyTaskIds"
              multiple
              className="w-full px-3 py-2 border rounded-md text-sm bg-background min-h-28"
              value={form.dependencyTaskIds}
              onChange={(e) =>
                setForm({
                  ...form,
                  dependencyTaskIds: Array.from(e.currentTarget.selectedOptions).map((o) => o.value),
                })
              }
            >
              {taskOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.status} · {t.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Hold Cmd/Ctrl to select multiple dependencies.</p>
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
