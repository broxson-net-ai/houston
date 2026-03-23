"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";

type SystemStatus = {
  key: string;
  value: { timestamp?: string; count?: number; [key: string]: unknown };
  updatedAt: string;
};

type ApprovalAuditOpsReport = {
  health: {
    checkedAt?: string;
    lagMinutes?: number;
    maxLagMinutes?: number;
    stale?: boolean;
  } | null;
  spike: {
    autoRatio?: number;
    prevRatio?: number;
    ratioDelta?: number;
    sampleCount?: number;
    flagged?: boolean;
  } | null;
  rotation: {
    ranAt?: string;
    rotated?: number;
    files?: number;
  } | null;
  weeklyReport: {
    windowDays: number;
    totalEvents: number;
    byDecision: Record<string, number>;
    byPath: Record<string, number>;
    autoRatio: number;
  };
};

type DelegationReport = {
  windowHours: number;
  totalRuns: number;
  mainRuns: number;
  specialistRuns: number;
  specialistShare: number;
  queue: number;
  blocked: number;
  inProgress: number;
  staleAccepted: number;
  avgQueueToStartMs: number;
  byAgent: Record<string, { runs: number; completed: number; failed: number }>;
};

type SeedReport = {
  dryRun: boolean;
  foundTasks: number;
  autoDispatchTouched: number;
  dependencyEdges: number;
  missingTitles: string[];
};

export default function AdminPage() {
  const [statuses, setStatuses] = useState<Record<string, SystemStatus>>({});
  const [health, setHealth] = useState<Record<string, string>>({});
  const [auditOps, setAuditOps] = useState<ApprovalAuditOpsReport | null>(null);
  const [delegation, setDelegation] = useState<DelegationReport | null>(null);
  const [seedReport, setSeedReport] = useState<SeedReport | null>(null);
  const [seeding, setSeeding] = useState<"dry" | "apply" | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch readyz status
    fetch("/api/readyz").then((r) => r.json()).then(setHealth);
    fetch("/api/system/approval-audit?windowDays=7")
      .then((r) => r.json())
      .then(setAuditOps)
      .catch(() => null);
    fetch("/api/system/delegation?windowHours=24")
      .then((r) => r.json())
      .then(setDelegation)
      .catch(() => null);

    // Would fetch system_status from an API in production
    // For now, display what we have
  }, []);

  async function runSeed(dryRun: boolean) {
    setSeeding(dryRun ? "dry" : "apply");
    setSeedError(null);
    try {
      const response = await fetch("/api/tasks/seed-portfolio-dependencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      setSeedReport(payload);
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : "Failed to seed dependencies");
    } finally {
      setSeeding(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold">Admin Diagnostics</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4 space-y-2">
            <h2 className="font-semibold">System Health</h2>
            {Object.entries(health).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm capitalize">{key}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  value === "ok" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div className="border rounded-lg p-4 space-y-2">
            <h2 className="font-semibold">Worker Status</h2>
            <p className="text-sm text-muted-foreground">
              Check the worker logs for scheduler tick timestamps.
              System status is updated by the worker process.
            </p>
          </div>
        </div>

        {auditOps && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Approval Audit Weekly Ops Report</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                auditOps.health?.stale || auditOps.spike?.flagged
                  ? "bg-red-100 text-red-800"
                  : "bg-green-100 text-green-800"
              }`}>
                {auditOps.health?.stale || auditOps.spike?.flagged ? "Attention" : "Healthy"}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Window</div>
                <div>{auditOps.weeklyReport.windowDays}d</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Total events</div>
                <div>{auditOps.weeklyReport.totalEvents}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Auto ratio</div>
                <div>{(auditOps.weeklyReport.autoRatio * 100).toFixed(1)}%</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Lag</div>
                <div>{auditOps.health?.lagMinutes ?? 0}m / {auditOps.health?.maxLagMinutes ?? 0}m</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Last rotation</div>
                <div>{auditOps.rotation?.ranAt ? new Date(auditOps.rotation.ranAt).toLocaleString() : "-"}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div className="border rounded p-2">
                <div className="font-medium mb-1">By Decision</div>
                <div className="text-muted-foreground">
                  {Object.entries(auditOps.weeklyReport.byDecision)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(" · ") || "-"}
                </div>
              </div>
              <div className="border rounded p-2">
                <div className="font-medium mb-1">By Decision Path</div>
                <div className="text-muted-foreground">
                  {Object.entries(auditOps.weeklyReport.byPath)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(" · ") || "-"}
                </div>
              </div>
            </div>
          </div>
        )}

        {delegation && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Delegation Telemetry (24h)</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Specialist share {(delegation.specialistShare * 100).toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Total runs</div>
                <div>{delegation.totalRuns}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Main runs</div>
                <div>{delegation.mainRuns}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Specialist runs</div>
                <div>{delegation.specialistRuns}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Queue / Blocked / In progress</div>
                <div>{delegation.queue} / {delegation.blocked} / {delegation.inProgress}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Avg queue→start</div>
                <div>{Math.round(delegation.avgQueueToStartMs / 1000)}s</div>
              </div>
            </div>

            <div className="text-xs border rounded p-2">
              <div className="font-medium mb-1">By Agent</div>
              <div className="text-muted-foreground">
                {Object.entries(delegation.byAgent)
                  .map(([name, m]) => `${name}: ${m.runs} runs (${m.completed} done/${m.failed} failed)`)
                  .join(" · ") || "-"}
              </div>
            </div>

            {delegation.staleAccepted > 0 && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                Stale accepted runs: {delegation.staleAccepted}. Scheduler recovery should clear these automatically.
              </div>
            )}
          </div>
        )}

        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Portfolio Dependency Seeding</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => runSeed(true)}
                disabled={Boolean(seeding)}
                className="px-3 py-1.5 text-xs border rounded hover:bg-muted disabled:opacity-50"
              >
                {seeding === "dry" ? "Running dry-run..." : "Dry-run"}
              </button>
              <button
                onClick={() => runSeed(false)}
                disabled={Boolean(seeding)}
                className="px-3 py-1.5 text-xs border rounded hover:bg-muted disabled:opacity-50"
              >
                {seeding === "apply" ? "Applying..." : "Apply"}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Seeds known portfolio dependency edges and enables auto-dispatch for matched tasks.
          </p>

          {seedReport && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Mode</div>
                <div>{seedReport.dryRun ? "dry-run" : "apply"}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Found tasks</div>
                <div>{seedReport.foundTasks}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Auto-dispatch touched</div>
                <div>{seedReport.autoDispatchTouched}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">Dependency edges</div>
                <div>{seedReport.dependencyEdges}</div>
              </div>
            </div>
          )}

          {seedReport && seedReport.missingTitles.length > 0 && (
            <div className="text-xs border rounded p-2">
              <div className="font-medium mb-1">Missing titles ({seedReport.missingTitles.length})</div>
              <div className="text-muted-foreground">
                {seedReport.missingTitles.join(" | ")}
              </div>
            </div>
          )}

          {seedError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {seedError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
