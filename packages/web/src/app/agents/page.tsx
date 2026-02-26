"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";

type Agent = {
  id: string;
  name: string;
  routingKey: string;
  avatarUrl?: string | null;
  tags: string[];
  enabled: boolean;
};

type AgentFormData = {
  name: string;
  routingKey: string;
  avatarUrl: string;
  tags: string;
  enabled: boolean;
};

const defaultForm: AgentFormData = {
  name: "",
  routingKey: "",
  avatarUrl: "",
  tags: "",
  enabled: true,
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState<AgentFormData>(defaultForm);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function loadAgents() {
    const res = await fetch("/api/agents");
    setAgents(await res.json());
  }

  useEffect(() => {
    loadAgents();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(defaultForm);
    setError("");
    setShowDialog(true);
  }

  function openEdit(agent: Agent) {
    setEditing(agent);
    setForm({
      name: agent.name,
      routingKey: agent.routingKey,
      avatarUrl: agent.avatarUrl ?? "",
      tags: (agent.tags as string[]).join(", "),
      enabled: agent.enabled,
    });
    setError("");
    setShowDialog(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const payload = {
      name: form.name,
      routingKey: form.routingKey,
      avatarUrl: form.avatarUrl || null,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      enabled: form.enabled,
    };

    const res = editing
      ? await fetch(`/api/agents/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "An error occurred");
      return;
    }

    setShowDialog(false);
    loadAgents();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    loadAgents();
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Agents</h1>
          <button
            onClick={openCreate}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90"
          >
            New Agent
          </button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Routing Key</th>
                <th className="text-left p-3 font-medium">Tags</th>
                <th className="text-left p-3 font-medium">Enabled</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} className="border-t hover:bg-muted/50">
                  <td className="p-3">{agent.name}</td>
                  <td className="p-3 font-mono text-xs">{agent.routingKey}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {(agent.tags as string[]).map((tag) => (
                        <span key={tag} className="text-xs bg-secondary px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${agent.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                      {agent.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(agent)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(agent.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No agents yet. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold">{editing ? "Edit Agent" : "New Agent"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="agent-name" className="block text-sm font-medium mb-1">Name *</label>
                <input
                  id="agent-name"
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor="agent-routing-key" className="block text-sm font-medium mb-1">Routing Key *</label>
                <input
                  id="agent-routing-key"
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background font-mono"
                  value={form.routingKey}
                  onChange={(e) => setForm({ ...form, routingKey: e.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor="agent-avatar-url" className="block text-sm font-medium mb-1">Avatar URL</label>
                <input
                  id="agent-avatar-url"
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                  value={form.avatarUrl}
                  onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="agent-tags" className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
                <input
                  id="agent-tags"
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                />
                <label htmlFor="enabled" className="text-sm">Enabled</label>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDialog(false)}
                  className="px-3 py-1.5 text-sm border rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
                >
                  {editing ? "Save" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-lg p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold">Delete Agent</h2>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this agent? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 text-sm border rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
