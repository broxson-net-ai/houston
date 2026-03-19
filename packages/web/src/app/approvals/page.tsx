"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";

type ApprovalRequest = {
  id: string;
  requestId: string;
  role: string;
  trigger: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  intent: string;
  target: string;
  risk: string;
  rollback: string;
  budget: {
    toolCallsUsed?: number;
    runtimeMinutes?: number;
    previousApprovalsThisTask?: number;
  } | null;
  context: {
    taskId?: string;
    projectId?: string;
    sessionId?: string;
  } | null;
  decision: "PENDING" | "APPROVED" | "DENIED" | "REVISED";
  decider: string | null;
  reason: string | null;
  outcome: string | null;
  createdAt: string;
  decidedAt: string | null;
  taskRunId: string | null;
};

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [filter, setFilter] = useState<"PENDING" | "APPROVED" | "DENIED" | "REVISED" | "ALL">("PENDING");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [revisionText, setRevisionText] = useState("");
  const [error, setError] = useState("");

  async function loadRequests() {
    const res = await fetch(`/api/approvals?decision=${filter}`);
    setRequests(await res.json());
  }

  useEffect(() => {
    loadRequests();
  }, [filter]);

  async function handleDecision(id: string, decision: "APPROVED" | "DENIED" | "REVISED") {
    setError("");
    if (decision === "REVISED" && !revisionText.trim()) {
      setError("Revision text is required for REVISED.");
      return;
    }

    const res = await fetch(`/api/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        reason: actionReason || undefined,
        revision: decision === "REVISED" ? revisionText : undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update");
      return;
    }
    setSelectedId(null);
    setActionReason("");
    setRevisionText("");
    loadRequests();
  }

  const severityColors = {
    LOW: "bg-gray-100 text-gray-800",
    MEDIUM: "bg-blue-100 text-blue-800",
    HIGH: "bg-amber-100 text-amber-800",
    CRITICAL: "bg-red-100 text-red-800",
  };

  const decisionColors = {
    PENDING: "bg-yellow-100 text-yellow-800",
    APPROVED: "bg-green-100 text-green-800",
    DENIED: "bg-red-100 text-red-800",
    REVISED: "bg-purple-100 text-purple-800",
  };

  function outcomeBadge(outcome: string | null) {
    const value = (outcome || "").toLowerCase();
    if (value.startsWith("blocked:")) {
      return { label: "Blocked", cls: "bg-red-100 text-red-800" };
    }
    if (value.includes("redispatched")) {
      return { label: "Redispatched", cls: "bg-purple-100 text-purple-800" };
    }
    if (value.startsWith("dispatched") || value.startsWith("already dispatched")) {
      return { label: "Dispatched", cls: "bg-green-100 text-green-800" };
    }
    if (value.startsWith("pending blocked apply")) {
      return { label: "Pending Block", cls: "bg-amber-100 text-amber-800" };
    }
    if (value.startsWith("revision captured")) {
      return { label: "Pending Revision", cls: "bg-blue-100 text-blue-800" };
    }
    if (value.startsWith("resume failed:")) {
      return { label: "Resume Failed", cls: "bg-red-100 text-red-800" };
    }
    if (!value) {
      return { label: "-", cls: "bg-gray-100 text-gray-700" };
    }
    return { label: "Other", cls: "bg-gray-100 text-gray-700" };
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Approvals</h1>
          <div className="flex gap-2">
            {(["PENDING", "APPROVED", "DENIED", "REVISED", "ALL"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium ${
                  filter === f ? "bg-primary text-primary-foreground" : "border"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Severity</th>
                <th className="text-left p-3 font-medium">Role</th>
                <th className="text-left p-3 font-medium">Trigger</th>
                <th className="text-left p-3 font-medium">Intent</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Outcome</th>
                <th className="text-left p-3 font-medium">Created</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-t hover:bg-muted/50">
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${severityColors[req.severity]}`}>
                      {req.severity}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">{req.role}</td>
                  <td className="p-3 text-xs">{req.trigger}</td>
                  <td className="p-3 max-w-xs truncate">{req.intent}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${decisionColors[req.decision]}`}>
                      {req.decision}
                    </span>
                  </td>
                  <td className="p-3">
                    {(() => {
                      const badge = outcomeBadge(req.outcome);
                      return (
                        <div className="space-y-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                          {req.outcome && (
                            <div className="max-w-xs truncate text-xs text-muted-foreground" title={req.outcome}>
                              {req.outcome}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(req.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedId(selectedId === req.id ? null : req.id)}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >
                        {selectedId === req.id ? "Close" : "Details"}
                      </button>
                      {req.decision === "PENDING" && (
                        <>
                          <button
                            onClick={() => handleDecision(req.id, "APPROVED")}
                            className="text-green-600 hover:text-green-800 text-xs"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleDecision(req.id, "DENIED")}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Deny
                          </button>
                          <button
                            onClick={() => handleDecision(req.id, "REVISED")}
                            className="text-purple-600 hover:text-purple-800 text-xs"
                          >
                            Revise
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No approval requests
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card border rounded-lg p-6 w-full max-w-lg space-y-4 max-h-[80vh] overflow-y-auto">
              {(() => {
                const req = requests.find((r) => r.id === selectedId);
                if (!req) return null;
                return (
                  <>
                    <h2 className="text-lg font-bold">Approval Request</h2>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Request ID:</span>{" "}
                        <span className="font-mono text-xs">{req.requestId}</span>
                      </div>
                      <div>
                        <span className="font-medium">Role:</span> {req.role}
                      </div>
                      <div>
                        <span className="font-medium">Trigger:</span> {req.trigger}
                      </div>
                      <div>
                        <span className="font-medium">Severity:</span> {req.severity}
                      </div>
                      <div>
                        <span className="font-medium">Intent:</span>
                        <p className="mt-1 p-2 bg-muted rounded">{req.intent}</p>
                      </div>
                      <div>
                        <span className="font-medium">Target:</span> {req.target || "N/A"}
                      </div>
                      <div>
                        <span className="font-medium">Risk:</span>
                        <p className="mt-1 p-2 bg-muted rounded">{req.risk || "N/A"}</p>
                      </div>
                      <div>
                        <span className="font-medium">Rollback:</span>
                        <p className="mt-1 p-2 bg-muted rounded">{req.rollback || "N/A"}</p>
                      </div>
                      {req.budget && (
                        <div>
                          <span className="font-medium">Budget:</span>{" "}
                          {req.budget.toolCallsUsed} calls, {req.budget.runtimeMinutes}m
                        </div>
                      )}
                      {req.decider && (
                        <div>
                          <span className="font-medium">Decider:</span> {req.decider}
                        </div>
                      )}
                      {req.reason && (
                        <div>
                          <span className="font-medium">Reason:</span> {req.reason}
                        </div>
                      )}
                      {req.outcome && (
                        <div>
                          <span className="font-medium">Outcome:</span> {req.outcome}
                        </div>
                      )}
                      {req.context?.taskId && (
                        <div>
                          <span className="font-medium">Task ID:</span> <span className="font-mono text-xs">{req.context.taskId}</span>
                        </div>
                      )}
                      {req.taskRunId && (
                        <div>
                          <span className="font-medium">Task Run ID:</span> <span className="font-mono text-xs">{req.taskRunId}</span>
                        </div>
                      )}
                      {req.context?.projectId && (
                        <div>
                          <span className="font-medium">Project ID:</span> <span className="font-mono text-xs">{req.context.projectId}</span>
                        </div>
                      )}
                      {req.decidedAt && (
                        <div>
                          <span className="font-medium">Decided:</span> {new Date(req.decidedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => {
                          setSelectedId(null);
                          setActionReason("");
                          setRevisionText("");
                          setError("");
                        }}
                        className="px-3 py-1.5 text-sm border rounded-md"
                      >
                        Close
                      </button>
                      {req.decision === "PENDING" && (
                        <>
                          <input
                            type="text"
                            placeholder="Reason (optional)"
                            value={actionReason}
                            onChange={(e) => setActionReason(e.target.value)}
                            className="px-3 py-1.5 text-sm border rounded-md flex-1"
                          />
                          <input
                            type="text"
                            placeholder="Revision text (required for Revise)"
                            value={revisionText}
                            onChange={(e) => setRevisionText(e.target.value)}
                            className="px-3 py-1.5 text-sm border rounded-md flex-1"
                          />
                          <button
                            onClick={() => handleDecision(req.id, "APPROVED")}
                            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:opacity-90"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleDecision(req.id, "DENIED")}
                            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:opacity-90"
                          >
                            Deny
                          </button>
                          <button
                            onClick={() => handleDecision(req.id, "REVISED")}
                            className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:opacity-90"
                          >
                            Revise
                          </button>
                        </>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
