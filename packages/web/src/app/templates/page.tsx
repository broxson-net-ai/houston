"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";

type Agent = { id: string; name: string };
type Schedule = {
  id: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  nextRunAt?: string | null;
  missedCount: number;
};
type Template = {
  id: string;
  name: string;
  instructions: string;
  skillRef?: string | null;
  tags: string[];
  priority: number;
  enabled: boolean;
  defaultAgentId?: string | null;
  defaultAgent?: Agent | null;
  schedules: Schedule[];
};

type Project = {
  slug: string;
  name: string;
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showScheduleDialog, setShowScheduleDialog] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    defaultAgentId: "",
    skillRef: "",
    instructions: "",
    tags: "",
    projectSlug: "",
    priority: 0,
    enabled: true,
  });
  const [scheduleForm, setScheduleForm] = useState({ cron: "", preset: "", timezone: "America/Los_Angeles", enabled: true });
  const [projectFilter, setProjectFilter] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [tRes, aRes, pRes] = await Promise.all([
      fetch("/api/templates"),
      fetch("/api/agents"),
      fetch("/api/projects"),
    ]);
    setTemplates(await tRes.json());
    setAgents(await aRes.json());
    const projectsData = await pRes.json();
    setProjects(projectsData.projects ?? []);
  }

  useEffect(() => { load(); }, []);

  const filteredTemplates = projectFilter
    ? templates.filter((template) =>
        (template.tags as string[]).some(
          (tag) => tag === `project:${projectFilter}`
        )
      )
    : templates;

  function findProjectTag(tags: string[]) {
    return tags.find((tag) => tag.startsWith("project:"))?.slice("project:".length) ?? "";
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: "", defaultAgentId: "", skillRef: "", instructions: "", tags: "", projectSlug: "", priority: 0, enabled: true });
    setError("");
    setShowDialog(true);
  }

  function openEdit(t: Template) {
    const tagList = (t.tags as string[]);
    setEditing(t);
    setForm({
      name: t.name,
      defaultAgentId: t.defaultAgentId ?? "",
      skillRef: t.skillRef ?? "",
      instructions: t.instructions,
      tags: tagList.join(", "),
      projectSlug: findProjectTag(tagList),
      priority: t.priority,
      enabled: t.enabled,
    });
    setError("");
    setShowDialog(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const baseTags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const filteredTags = baseTags.filter((tag) => !tag.startsWith("project:"));
    if (form.projectSlug) {
      filteredTags.push(`project:${form.projectSlug}`);
    }

    const payload = {
      name: form.name,
      defaultAgentId: form.defaultAgentId || null,
      skillRef: form.skillRef || null,
      instructions: form.instructions,
      tags: filteredTags,
      priority: form.priority,
      enabled: form.enabled,
    };
    const res = editing
      ? await fetch(`/api/templates/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) { setError((await res.json()).error); return; }
    setShowDialog(false);
    load();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    load();
  }

  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/templates/${showScheduleDialog}/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cron: scheduleForm.cron || undefined,
        preset: scheduleForm.preset || undefined,
        timezone: scheduleForm.timezone,
        enabled: scheduleForm.enabled,
      }),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setShowScheduleDialog(null);
    load();
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Templates</h1>
          <div className="flex items-center gap-3">
            <select
              className="px-3 py-1.5 text-sm border rounded-md bg-background"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.slug} value={project.slug}>
                  {project.name}
                </option>
              ))}
            </select>
            <button onClick={openCreate} className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90">
              New Template
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {filteredTemplates.map((t) => (
            <div key={t.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{t.name}</h3>
                  {t.defaultAgent && <p className="text-sm text-muted-foreground">Agent: {t.defaultAgent.name}</p>}
                  {t.skillRef && <p className="text-xs text-muted-foreground">Skill: {t.skillRef}</p>}
                  {(t.tags as string[]).some((tag) => tag.startsWith("project:")) && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {(t.tags as string[])
                        .filter((tag) => tag.startsWith("project:"))
                        .map((tag) => (
                          <span key={tag} className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground">
                            {tag.replace("project:", "Project: ")}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowScheduleDialog(t.id)} className="text-sm text-blue-600 hover:text-blue-800">Add Schedule</button>
                  <button onClick={() => openEdit(t)} className="text-sm text-blue-600 hover:text-blue-800">Edit</button>
                  <button onClick={() => handleDelete(t.id)} className="text-sm text-red-600 hover:text-red-800">Delete</button>
                </div>
              </div>
              {t.schedules.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Schedules</p>
                  {t.schedules.map((s) => (
                    <div key={s.id} className="text-xs bg-muted rounded px-2 py-1 flex items-center justify-between">
                      <span className="font-mono">{s.cron}</span>
                      <span className="text-muted-foreground">{s.timezone}</span>
                      {s.nextRunAt && <span>{new Date(s.nextRunAt).toLocaleString()}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filteredTemplates.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No templates yet.</p>
          )}
        </div>
      </div>

      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-lg p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold">{editing ? "Edit Template" : "New Template"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="tpl-name" className="block text-sm font-medium mb-1">Name *</label>
                <input id="tpl-name" className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="tpl-agent" className="block text-sm font-medium mb-1">Default Agent</label>
                <select id="tpl-agent" className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.defaultAgentId} onChange={(e) => setForm({ ...form, defaultAgentId: e.target.value })}>
                  <option value="">None</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="tpl-skill" className="block text-sm font-medium mb-1">Skill Reference</label>
                <input id="tpl-skill" className="w-full px-3 py-2 border rounded-md text-sm bg-background font-mono" value={form.skillRef} onChange={(e) => setForm({ ...form, skillRef: e.target.value })} placeholder="skill-name" />
              </div>
              <div>
                <label htmlFor="tpl-instructions" className="block text-sm font-medium mb-1">Instructions *</label>
                <textarea id="tpl-instructions" className="w-full px-3 py-2 border rounded-md text-sm bg-background" rows={6} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="tpl-project" className="block text-sm font-medium mb-1">Project</label>
                <select
                  id="tpl-project"
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                  value={form.projectSlug}
                  onChange={(e) => setForm({ ...form, projectSlug: e.target.value })}
                >
                  <option value="">None</option>
                  {projects.map((project) => (
                    <option key={project.slug} value={project.slug}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="tpl-tags" className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
                <input id="tpl-tags" className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowDialog(false)} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
                <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90">{editing ? "Save" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showScheduleDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold">Add Schedule</h2>
            <form onSubmit={handleAddSchedule} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Preset</label>
                <select className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={scheduleForm.preset} onChange={(e) => setScheduleForm({ ...scheduleForm, preset: e.target.value, cron: "" })}>
                  <option value="">Custom cron</option>
                  <option value="daily_5am">Daily at 5am</option>
                  <option value="daily_midnight">Daily at midnight</option>
                  <option value="weekly_monday">Weekly Monday 9am</option>
                  <option value="weekly_friday">Weekly Friday 9am</option>
                  <option value="hourly">Hourly</option>
                  <option value="every_6h">Every 6 hours</option>
                  <option value="every_12h">Every 12 hours</option>
                </select>
              </div>
              {!scheduleForm.preset && (
                <div>
                  <label className="block text-sm font-medium mb-1">Cron Expression</label>
                  <input className="w-full px-3 py-2 border rounded-md text-sm bg-background font-mono" value={scheduleForm.cron} onChange={(e) => setScheduleForm({ ...scheduleForm, cron: e.target.value })} placeholder="0 5 * * *" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Timezone</label>
                <input className="w-full px-3 py-2 border rounded-md text-sm bg-background" value={scheduleForm.timezone} onChange={(e) => setScheduleForm({ ...scheduleForm, timezone: e.target.value })} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowScheduleDialog(null)} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
                <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
