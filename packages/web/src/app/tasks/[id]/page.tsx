"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { useParams } from "next/navigation";

type TaskEvent = { id: string; type: string; message?: string | null; createdAt: string };
type TaskLog = { id: string; logText: string; truncated: boolean };
type TaskRun = {
  id: string;
  attemptNumber: number;
  status: string;
  dispatchedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  wsRequestId?: string | null;
  gatewayRunId?: string | null;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  errorText?: string | null;
  taskLogs: TaskLog[];
  taskEvents: TaskEvent[];
};
type Task = {
  id: string;
  title: string;
  status: string;
  dueAt?: string | null;
  assembledInstructionsSnapshot?: string | null;
  preInstructionsVersion?: string | null;
  projectId?: string | null;
  project?: { id: string; slug: string; name: string } | null;
  agent?: { id: string; name: string } | null;
  template?: { id: string; name: string } | null;
  schedule?: { id: string; cron: string; missedCount: number } | null;
  autoDispatch?: boolean;
  dependencies?: Array<{ id: string; dependsOnTask: { id: string; title: string; status: string; project?: { slug: string; title: string } | null } }>;
  dependedBy?: Array<{ id: string; task: { id: string; title: string; status: string; autoDispatch: boolean; project?: { slug: string; title: string } | null } }>;
  taskRuns: TaskRun[];
  taskEvents: TaskEvent[];
};

type TaskOption = { id: string; title: string; status: string; project?: { slug: string; title: string } | null };

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    QUEUE: "bg-blue-100 text-blue-800",
    BLOCKED: "bg-amber-100 text-amber-800",
    IN_PROGRESS: "bg-yellow-100 text-yellow-800",
    DONE: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? "bg-gray-100 text-gray-800"}`}>
      {status}
    </span>
  );
}

export default function TaskDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [task, setTask] = useState<Task | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [showPayload, setShowPayload] = useState(false);
  const [taskOptions, setTaskOptions] = useState<TaskOption[]>([]);
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);
  const [savingDeps, setSavingDeps] = useState(false);
  const [autoDispatch, setAutoDispatch] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/tasks/${id}`).then((r) => r.json()).then((t) => {
      setTask(t);
      setSelectedDeps((t.dependencies ?? []).map((d: any) => d.dependsOnTask.id));
      setAutoDispatch(Boolean(t.autoDispatch));
      if (t.taskRuns?.length > 0) {
        setActiveRunId(t.taskRuns[t.taskRuns.length - 1].id);
      }
    });
    fetch('/api/tasks?view=list').then((r) => r.json()).then((payload) => {
      setTaskOptions(payload.tasks ?? []);
    });
  }, [id]);

  async function saveDependencies(nextDeps: string[]) {
    setSavingDeps(true);
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dependencyTaskIds: nextDeps }),
    });
    setSavingDeps(false);
    window.location.reload();
  }

  async function saveAutoDispatch(next: boolean) {
    setAutoDispatch(next);
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoDispatch: next }),
    });
    window.location.reload();
  }

  if (!task) return <div className="min-h-screen bg-background"><Nav /><p className="p-8 text-muted-foreground">Loading...</p></div>;

  const activeRun = task.taskRuns.find((r) => r.id === activeRunId) ?? task.taskRuns[task.taskRuns.length - 1];
  const allEvents = Array.from(
    [...task.taskEvents, ...(activeRun?.taskEvents ?? [])].reduce((acc, event) => {
      if (!acc.has(event.id)) {
        acc.set(event.id, event);
      }
      return acc;
    }, new Map<string, TaskEvent>()).values()
  ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{task.title}</h1>
            <StatusBadge status={task.status} />
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {task.project && <span>Project: {task.project.name}</span>}
            {task.agent && <span>Agent: {task.agent.name}</span>}
            {task.template && <span>Template: {task.template.name}</span>}
            {task.dueAt && <span>Due: {new Date(task.dueAt).toLocaleString()}</span>}
            {(task.schedule?.missedCount ?? 0) > 0 && (
              <span className="text-orange-600 font-medium">MISSED: {task.schedule?.missedCount}</span>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            {task.status === "FAILED" && (
              <button
                onClick={async () => {
                  await fetch(`/api/tasks/${id}/retry`, { method: "POST" });
                  window.location.reload();
                }}
                className="px-3 py-1.5 text-sm bg-orange-100 text-orange-800 rounded-md hover:opacity-90"
              >
                Retry
              </button>
            )}
            <button
              onClick={async () => {
                await fetch(`/api/tasks/${id}/dispatch`, { method: "POST" });
                window.location.reload();
              }}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
            >
              Dispatch Now
            </button>
            <a href="/board" className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">
              Back to Board
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Activity Timeline */}
          <div className="md:col-span-1 space-y-2">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Activity Timeline</h2>
            <div className="space-y-2">
              {allEvents.map((event, index) => (
                <div key={`${event.id}:${event.createdAt}:${index}`} className="flex gap-3 text-sm">
                  <div className="shrink-0 w-2 h-2 mt-1.5 rounded-full bg-primary" />
                  <div>
                    <p className="font-medium">{event.type}</p>
                    {event.message && <p className="text-muted-foreground text-xs">{event.message}</p>}
                    <p className="text-muted-foreground text-xs">{new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              {allEvents.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
            </div>
          </div>

          {/* Main content */}
          <div className="md:col-span-2 space-y-6">
            <div className="space-y-2 border rounded-md p-3">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Dependencies</h2>
              <div className="flex items-center gap-2 text-xs">
                <label className="font-medium">Auto Dispatch</label>
                <input
                  type="checkbox"
                  checked={autoDispatch}
                  onChange={(e) => saveAutoDispatch(e.target.checked)}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Depends on: {(task.dependencies ?? []).length} · Unblocks: {(task.dependedBy ?? []).length}
              </div>
              {(task.dependencies ?? []).length > 0 && (
                <ul className="text-xs space-y-1">
                  {(task.dependencies ?? []).map((dep) => (
                    <li key={dep.id}>
                      {dep.dependsOnTask.status} · {dep.dependsOnTask.title}
                    </li>
                  ))}
                </ul>
              )}
              {(task.dependedBy ?? []).length > 0 && (
                <div className="text-xs">
                  <div className="font-medium mb-1">Unblocks</div>
                  <ul className="space-y-1">
                    {(task.dependedBy ?? []).map((dep) => (
                      <li key={dep.id}>{dep.task.status} · {dep.task.title}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium">Edit dependencies</label>
                <select
                  multiple
                  className="w-full px-2 py-2 border rounded-md text-xs bg-background min-h-28"
                  value={selectedDeps}
                  onChange={(e) => {
                    const vals = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
                    setSelectedDeps(vals);
                  }}
                >
                  {taskOptions
                    .filter((opt) => opt.id !== task.id)
                    .map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.status} · {opt.title}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => saveDependencies(selectedDeps)}
                  disabled={savingDeps}
                  className="px-2 py-1 text-xs border rounded hover:bg-muted"
                >
                  {savingDeps ? 'Saving…' : 'Save dependencies'}
                </button>
              </div>
            </div>

            {/* Runs list (if multiple) */}
            {task.taskRuns.length > 1 && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Attempts</h2>
                <div className="flex gap-2">
                  {task.taskRuns.map((run) => (
                    <button
                      key={run.id}
                      onClick={() => setActiveRunId(run.id)}
                      className={`px-3 py-1.5 text-xs rounded-md border ${activeRunId === run.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      Attempt #{run.attemptNumber} — {run.status}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Logs */}
            {activeRun && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Execution Logs</h2>
                {activeRun.taskLogs.length > 0 ? (
                  activeRun.taskLogs.map((log) => (
                    <div key={log.id} className="space-y-1">
                      {log.truncated && (
                        <p className="text-xs text-orange-600">Log truncated (hit size limit)</p>
                      )}
                      <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-64 whitespace-pre-wrap">
                        {log.logText}
                      </pre>
                      <button
                        onClick={() => navigator.clipboard.writeText(log.logText)}
                        className="text-xs text-muted-foreground hover:text-primary"
                      >
                        Copy
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No logs captured yet.</p>
                )}
              </div>
            )}

            {/* Dispatch payload */}
            {activeRun?.requestPayload && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowPayload(!showPayload)}
                  className="font-semibold text-sm uppercase tracking-wide text-muted-foreground flex items-center gap-2"
                >
                  Dispatch Payload {showPayload ? "▲" : "▼"}
                </button>
                {showPayload && (
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48 whitespace-pre-wrap">
                    {JSON.stringify(activeRun.requestPayload, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Instructions snapshot */}
            {task.assembledInstructionsSnapshot && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Instructions Snapshot</h2>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48 whitespace-pre-wrap">
                  {task.assembledInstructionsSnapshot}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
