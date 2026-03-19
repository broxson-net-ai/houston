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
    trustMode?: string;
    approvalPattern?: string;
    intentSignature?: string;
  } | null;
  decision: "PENDING" | "APPROVED" | "DENIED" | "REVISED";
  decider: string | null;
  reason: string | null;
  outcome: string | null;
  createdAt: string;
  decidedAt: string | null;
  taskRunId: string | null;
};

type ApprovalSummary = {
  windowHours: number;
  total: number;
  pending: number;
  denied: number;
  revised: number;
  autoApproved: number;
  manualApproved: number;
  byTrigger: Array<{
    trigger: string;
    total: number;
    pending: number;
    denied: number;
    revised: number;
    autoApproved: number;
    manualApproved: number;
  }>;
};

type TrustVerification = {
  checkedAt: string;
  windowHours: number;
  trustDefault: string;
  trustModes: Record<string, string>;
  total: number;
  autoApproved: number;
  manualApproved: number;
  pending: number;
  denied: number;
  revised: number;
  flaggedCriticalAuto: Array<{ trigger: string; autoApproved: number }>;
};

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [filter, setFilter] = useState<"PENDING" | "APPROVED" | "DENIED" | "REVISED" | "ALL">("PENDING");
  const [trustFilter, setTrustFilter] = useState<"ALL" | "AUTO_ONLY" | "MANUAL_ONLY">("ALL");
  const [triggerFilter, setTriggerFilter] = useState<string>("ALL");
  const [summary, setSummary] = useState<ApprovalSummary | null>(null);
  const [trustHealth, setTrustHealth] = useState<TrustVerification | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [revisionText, setRevisionText] = useState("");
  const [error, setError] = useState("");

  async function loadRequests() {
    const [approvalsRes, trustRes] = await Promise.all([
      fetch(`/api/approvals?decision=${filter}&trust=${trustFilter}&trigger=${encodeURIComponent(triggerFilter)}&includeSummary=1&windowHours=48`),
      fetch("/api/system/trust"),
    ]);
    const data = await approvalsRes.json();
    const trustData = await trustRes.json();
    setRequests(data.requests ?? []);
    setSummary(data.summary ?? null);
    setTrustHealth(trustData.value ?? null);
  }

  useEffect(() => {
    loadRequests();
  }, [filter, trustFilter, triggerFilter]);

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
          <div className="flex flex-col items-end gap-2">
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
            <div className="flex gap-2">
              {([
                { id: "ALL", label: "All Decisions" },
                { id: "AUTO_ONLY", label: "Auto Approved" },
                { id: "MANUAL_ONLY", label: "Manual/Non-auto" },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setTrustFilter(opt.id)}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium ${
                    trustFilter === opt.id ? "bg-slate-800 text-white" : "border"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Trigger:</span>
              <select
                value={triggerFilter}
                onChange={(e) => setTriggerFilter(e.target.value)}
                className="px-2 py-1 border rounded-md bg-background"
              >
                <option value="ALL">All triggers</option>
                {(summary?.byTrigger ?? []).map((row) => (
                  <option key={row.trigger} value={row.trigger}>
                    {row.trigger}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Window</div>
              <div className="font-semibold">{summary.windowHours}h</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="font-semibold">{summary.total}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Pending</div>
              <div className="font-semibold">{summary.pending}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Manual Approved</div>
              <div className="font-semibold text-green-700">{summary.manualApproved}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Auto Approved</div>
              <div className="font-semibold text-indigo-700">{summary.autoApproved}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Denied</div>
              <div className="font-semibold text-red-700">{summary.denied}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Revised</div>
              <div className="font-semibold text-purple-700">{summary.revised}</div>
            </div>
          </div>
        )}

        {trustHealth && (
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Trust Health</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                trustHealth.flaggedCriticalAuto.length > 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
              }`}>
                {trustHealth.flaggedCriticalAuto.length > 0 ? "Attention" : "Healthy"}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Last check</div>
                <div>{new Date(trustHealth.checkedAt).toLocaleString()}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Window</div>
                <div>{trustHealth.windowHours}h</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Default mode</div>
                <div>{trustHealth.trustDefault}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Auto/manual</div>
                <div>{trustHealth.autoApproved}/{trustHealth.manualApproved}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Critical auto</div>
                <div>{trustHealth.flaggedCriticalAuto.length}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Modes: {Object.entries(trustHealth.trustModes).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setFilter("APPROVED");
                  setTrustFilter("AUTO_ONLY");
                  setTriggerFilter("ALL");
                }}
                className="px-2 py-1 text-xs rounded-md border"
              >
                Show Auto Approvals
              </button>
              <button
                onClick={() => {
                  setFilter("APPROVED");
                  setTrustFilter("MANUAL_ONLY");
                  setTriggerFilter("ALL");
                }}
                className="px-2 py-1 text-xs rounded-md border"
              >
                Show Manual Approvals
              </button>
              <button
                onClick={() => {
                  setFilter("DENIED");
                  setTrustFilter("ALL");
                  setTriggerFilter("ALL");
                }}
                className="px-2 py-1 text-xs rounded-md border"
              >
                Show Denials
              </button>
            </div>
          </div>
        )}

        {summary && summary.byTrigger.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b bg-muted text-xs font-medium">Trigger Trust Breakdown (last {summary.windowHours}h)</div>
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left p-2 font-medium">Trigger</th>
                  <th className="text-left p-2 font-medium">Total</th>
                  <th className="text-left p-2 font-medium">Manual</th>
                  <th className="text-left p-2 font-medium">Auto</th>
                  <th className="text-left p-2 font-medium">Pending</th>
                  <th className="text-left p-2 font-medium">Denied</th>
                  <th className="text-left p-2 font-medium">Revised</th>
                </tr>
              </thead>
              <tbody>
                {summary.byTrigger.slice(0, 12).map((row) => (
                  <tr key={row.trigger} className="border-t">
                    <td className="p-2 font-mono">
                      <button
                        onClick={() => setTriggerFilter(row.trigger)}
                        className="underline underline-offset-2"
                      >
                        {row.trigger}
                      </button>
                    </td>
                    <td className="p-2">{row.total}</td>
                    <td className="p-2">{row.manualApproved}</td>
                    <td className="p-2">{row.autoApproved}</td>
                    <td className="p-2">{row.pending}</td>
                    <td className="p-2">{row.denied}</td>
                    <td className="p-2">{row.revised}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
