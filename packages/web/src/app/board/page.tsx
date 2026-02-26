"use client";

import { useEffect, useState, useCallback } from "react";
import { Nav } from "@/components/nav";

type Agent = { id: string; name: string; routingKey: string; avatarUrl?: string | null };
type Task = {
  id: string;
  title: string;
  status: string;
  dueAt?: string | null;
  agentId?: string | null;
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

function TaskCard({ task, onAction }: { task: Task; onAction: () => void }) {
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
      {task.agent && (
        <p className="text-xs text-muted-foreground">{task.agent.name}</p>
      )}
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
          onClick={async () => {
            await fetch(`/api/tasks/${task.id}/dispatch`, { method: "POST" });
            onAction();
          }}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Dispatch
        </button>
        {task.status === "FAILED" && (
          <button
            onClick={async () => {
              await fetch(`/api/tasks/${task.id}/retry`, { method: "POST" });
              onAction();
            }}
            className="text-xs text-orange-600 hover:text-orange-800 ml-2"
          >
            Retry
          </button>
        )}
        <button
          onClick={async () => {
            await fetch(`/api/tasks/${task.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ archivedAt: new Date().toISOString() }),
            });
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

export default function BoardPage() {
  const [view, setView] = useState<"status" | "agent">("status");
  const [statusData, setStatusData] = useState<StatusGrouped | null>(null);
  const [agentData, setAgentData] = useState<AgentGrouped | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [q, setQ] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view });
      if (q) params.set("q", q);
      if (filterAgent) params.set("agentId", filterAgent);
      if (showArchived) params.set("archived", "true");

      const [tasksRes, agentsRes] = await Promise.all([
        fetch(`/api/tasks?${params}`),
        fetch("/api/agents"),
      ]);
      const tasksData = await tasksRes.json();
      const agentsData = await agentsRes.json();

      setAgents(agentsData);
      if (view === "status") setStatusData({ ...tasksData.grouped, scheduled: tasksData.scheduled ?? [] });
      else setAgentData(tasksData.grouped);
    } finally {
      setLoading(false);
    }
  }, [view, q, filterAgent, showArchived]);

  useEffect(() => {
    const timer = setTimeout(fetchData, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

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
          <div className="grid grid-cols-5 gap-4">
            {/* Scheduled column */}
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
                <div key={col} className="space-y-2">
                  <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    {col} ({items.length})
                  </h2>
                  {items.map((task) => (
                    <TaskCard key={task.id} task={task} onAction={fetchData} />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Agent View */}
        {view === "agent" && agentData && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {Object.entries(agentData).map(([agentId, tasks]) => {
              const agent = agents.find((a) => a.id === agentId);
              return (
                <div key={agentId} className="min-w-[220px] space-y-2">
                  <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    {agent?.name ?? "Unassigned"} ({tasks.length})
                  </h2>
                  {tasks.map((task) => (
                    <TaskCard key={task.id} task={task} onAction={fetchData} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
