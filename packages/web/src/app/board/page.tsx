"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Nav } from "@/components/nav";

type Agent = { id: string; name: string; routingKey: string; avatarUrl?: string | null };
type Project = { id: string; slug: string; name: string };
type Task = {
  id: string;
  title: string;
  status: string;
  dueAt?: string | null;
  agentId?: string | null;
  projectId?: string | null;
  project?: Project | null;
  agent?: Agent | null;
  schedule?: { missedCount: number; lastMissedAt?: string | null } | null;
};
type ScheduledItem = {
  id: string;
  nextRunAt: string;
  template: { name: string; defaultAgent?: Agent | null };
};

type StatusGrouped = {
  QUEUE: Task[];
  IN_PROGRESS: Task[];
  DONE: Task[];
  FAILED: Task[];
  scheduled: ScheduledItem[];
};

type AgentGrouped = Record<string, Task[]>;

const STATUS_COLUMNS = ["Scheduled", "Queue", "In Progress", "Done", "Failed"] as const;
const STATUS_MAP: Record<string, keyof Omit<StatusGrouped, "scheduled">> = {
  Queue: "QUEUE",
  "In Progress": "IN_PROGRESS",
  Done: "DONE",
  Failed: "FAILED",
};

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    QUEUE: "bg-blue-100 text-blue-800",
    IN_PROGRESS: "bg-yellow-100 text-yellow-800",
    DONE: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
  };
  const labels: Record<string, string> = {
    QUEUE: "Queue",
    IN_PROGRESS: "In Progress",
    DONE: "Done",
    FAILED: "Failed",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? "bg-gray-100 text-gray-800"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function TaskCard({
  task,
  onAction,
  pushToast,
}: {
  task: Task;
  onAction: () => void;
  pushToast: (type: "success" | "error", message: string) => void;
}) {
  const missedCount = task.schedule?.missedCount ?? 0;

  return (
    <div className="bg-card border rounded-lg p-3 space-y-2 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <a href={`/tasks/${task.id}`} className="text-sm font-medium hover:underline line-clamp-2">
          {task.title}
        </a>
        {missedCount > 0 && (
          <span className="shrink-0 text-xs bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-medium">
            MISSED: {missedCount}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {task.project && (
          <span className="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-medium">
            {task.project.name}
          </span>
        )}
        {task.agent && (
          <p className="text-xs text-muted-foreground">{task.agent.name}</p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <StatusBadge status={task.status} />
        {task.dueAt && (
          <span className="text-xs text-muted-foreground">
            {new Date(task.dueAt).toLocaleString()}
          </span>
        )}
      </div>
      <div className="flex gap-1 pt-1">
        <button
          onClick={async (e) => {
            e.stopPropagation();
            const res = await fetch(`/api/tasks/${task.id}/dispatch`, {
              method: "POST",
              credentials: "include",
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              pushToast("error", data.error || "Dispatch failed");
              return;
            }
            pushToast("success", "Dispatch queued");
            onAction();
          }}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Dispatch
        </button>
        {task.status === "FAILED" && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const res = await fetch(`/api/tasks/${task.id}/retry`, {
                method: "POST",
                credentials: "include",
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                pushToast("error", data.error || "Retry failed");
                return;
              }
              pushToast("success", "Retry queued");
              onAction();
            }}
            className="text-xs text-orange-600 hover:text-orange-800 ml-2"
          >
            Retry
          </button>
        )}
        <button
          onClick={async (e) => {
            e.stopPropagation();
            const res = await fetch(`/api/tasks/${task.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ archivedAt: new Date().toISOString() }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              pushToast("error", data.error || "Archive failed");
              return;
            }
            pushToast("success", "Task archived");
            onAction();
          }}
          className="text-xs text-gray-500 hover:text-gray-800 ml-2"
        >
          Archive
        </button>
      </div>
    </div>
  );
}

function DroppableColumn({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "ring-2 ring-primary/50 bg-primary/5 rounded-lg" : ""}`}
    >
      {children}
    </div>
  );
}

function DraggableTaskCard({
  task,
  onAction,
  pushToast,
}: {
  task: Task;
  onAction: () => void;
  pushToast: (type: "success" | "error", message: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={isDragging ? "opacity-40" : ""}
    >
      <div className="relative">
        <div
          {...listeners}
          className="absolute right-2 top-2 h-4 w-4 cursor-grab rounded-sm border bg-muted text-[10px] leading-4 text-center text-muted-foreground"
          title="Drag"
        >
          ⠿
        </div>
        <TaskCard task={task} onAction={onAction} pushToast={pushToast} />
      </div>
    </div>
  );
}

function findTaskInStatusData(taskId: string, data: StatusGrouped): Task | undefined {
  for (const key of ["QUEUE", "IN_PROGRESS", "DONE", "FAILED"] as const) {
    const found = data[key].find((t) => t.id === taskId);
    if (found) return found;
  }
}

function findTaskInAgentData(taskId: string, data: AgentGrouped): Task | undefined {
  for (const tasks of Object.values(data)) {
    const found = tasks.find((t) => t.id === taskId);
    if (found) return found;
  }
}

export default function BoardPage() {
  const [view, setView] = useState<"status" | "agent">("status");
  const [statusData, setStatusData] = useState<StatusGrouped | null>(null);
  const [agentData, setAgentData] = useState<AgentGrouped | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [q, setQ] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; type: "success" | "error"; message: string }>>([]);

  function pushToast(type: "success" | "error", message: string) {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, type, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2500);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view });
      if (q) params.set("q", q);
      if (filterAgent) params.set("agentId", filterAgent);
      if (filterProject) params.set("projectId", filterProject);
      if (showArchived) params.set("archived", "true");

      const [tasksRes, agentsRes, projectsRes] = await Promise.all([
        fetch(`/api/tasks?${params}`),
        fetch("/api/agents"),
        fetch("/api/projects"),
      ]);
      const tasksData = await tasksRes.json();
      const agentsData = await agentsRes.json();
      const projectsData = await projectsRes.json();

      setAgents(agentsData);
      setProjects(projectsData.projects ?? []);
      if (view === "status") setStatusData({ ...tasksData.grouped, scheduled: tasksData.scheduled ?? [] });
      else setAgentData(tasksData.grouped);
    } finally {
      setLoading(false);
    }
  }, [view, q, filterAgent, filterProject, showArchived]);

  useEffect(() => {
    const timer = setTimeout(fetchData, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  function handleDragStart(event: DragStartEvent) {
    const taskId = event.active.id as string;
    if (statusData) {
      const task = findTaskInStatusData(taskId, statusData);
      if (task) { setActiveTask(task); return; }
    }
    if (agentData) {
      const task = findTaskInAgentData(taskId, agentData);
      if (task) { setActiveTask(task); return; }
    }
  }

  async function handleStatusDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over || !statusData) return;

    const taskId = active.id as string;
    const newStatus = over.id as string;
    const task = findTaskInStatusData(taskId, statusData);
    if (!task || task.status === newStatus) return;

    // Optimistic update
    const prev = statusData;
    setStatusData((current) => {
      if (!current) return current;
      const updated = { ...current } as StatusGrouped;
      for (const key of ["QUEUE", "IN_PROGRESS", "DONE", "FAILED"] as const) {
        updated[key] = current[key].filter((t) => t.id !== taskId);
      }
      const newKey = newStatus as keyof Omit<StatusGrouped, "scheduled">;
      updated[newKey] = [...updated[newKey], { ...task, status: newStatus }];
      return updated;
    });

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) setStatusData(prev);
  }

  async function handleAgentDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over || !agentData) return;

    const taskId = active.id as string;
    const newAgentId = over.id as string;
    const task = findTaskInAgentData(taskId, agentData);
    if (!task || task.agentId === newAgentId) return;

    // Optimistic update
    const prev = agentData;
    setAgentData((current) => {
      if (!current) return current;
      const updated: AgentGrouped = {};
      for (const [aid, tasks] of Object.entries(current)) {
        updated[aid] = tasks.filter((t) => t.id !== taskId);
      }
      const newAgent = agents.find((a) => a.id === newAgentId) ?? null;
      updated[newAgentId] = [...(updated[newAgentId] ?? []), { ...task, agentId: newAgentId, agent: newAgent }];
      return updated;
    });

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: newAgentId }),
    });
    if (!res.ok) setAgentData(prev);
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">Board</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setView("status")}
              className={`px-3 py-1.5 text-sm rounded-md font-medium ${view === "status" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
            >
              Status View
            </button>
            <button
              onClick={() => setView("agent")}
              className={`px-3 py-1.5 text-sm rounded-md font-medium ${view === "agent" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
            >
              Agent View
            </button>
          </div>
          <input
            type="search"
            placeholder="Search tasks..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="px-3 py-1.5 text-sm border rounded-md bg-background"
          />
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="px-3 py-1.5 text-sm border rounded-md bg-background"
          >
            <option value="">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-3 py-1.5 text-sm border rounded-md bg-background"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show Archived
          </label>
          <a
            href="/tasks/new"
            className="ml-auto px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90"
          >
            New Task
          </a>
        </div>

        {loading && <p className="text-muted-foreground text-sm">Loading...</p>}

        {/* Status View */}
        {view === "status" && statusData && (
          <DndContext onDragStart={handleDragStart} onDragEnd={handleStatusDragEnd}>
            <div className="grid grid-cols-5 gap-4">
              {/* Scheduled column — read-only, not droppable */}
              <div className="space-y-2">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Scheduled ({statusData.scheduled?.length ?? 0})
                </h2>
                {statusData.scheduled?.map((s) => (
                  <div key={s.id} className="bg-card border rounded-lg p-3 space-y-1">
                    <p className="text-sm font-medium">{s.template.name}</p>
                    {s.template.defaultAgent && (
                      <p className="text-xs text-muted-foreground">{s.template.defaultAgent.name}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.nextRunAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>

              {/* Queue, In Progress, Done, Failed columns */}
              {(["Queue", "In Progress", "Done", "Failed"] as const).map((col) => {
                const key = STATUS_MAP[col];
                const items = statusData[key] ?? [];
                return (
                  <DroppableColumn key={col} id={key} className="space-y-2">
                    <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      {col} ({items.length})
                    </h2>
                    {items.map((task) => (
                      <DraggableTaskCard key={task.id} task={task} onAction={fetchData} pushToast={pushToast} />
                    ))}
                  </DroppableColumn>
                );
              })}
            </div>
            <DragOverlay>
              {activeTask ? (
                <TaskCard task={activeTask} onAction={() => {}} pushToast={pushToast} />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* Agent View */}
        {view === "agent" && agentData && (
          <DndContext onDragStart={handleDragStart} onDragEnd={handleAgentDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {Object.entries(agentData).map(([agentId, tasks]) => {
                const agent = agents.find((a) => a.id === agentId);
                return (
                  <DroppableColumn key={agentId} id={agentId} className="min-w-[220px] space-y-2">
                    <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      {agent?.name ?? "Unassigned"} ({tasks.length})
                    </h2>
                    {tasks.map((task) => (
                      <DraggableTaskCard key={task.id} task={task} onAction={fetchData} pushToast={pushToast} />
                    ))}
                  </DroppableColumn>
                );
              })}
            </div>
            <DragOverlay>
              {activeTask ? (
                <TaskCard task={activeTask} onAction={() => {}} pushToast={pushToast} />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-md px-4 py-2 text-sm shadow-lg border ${
                toast.type === "success"
                  ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                  : "bg-red-50 text-red-900 border-red-200"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
