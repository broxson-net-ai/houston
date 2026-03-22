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

export default function AdminPage() {
  const [statuses, setStatuses] = useState<Record<string, SystemStatus>>({});
  const [health, setHealth] = useState<Record<string, string>>({});
  const [auditOps, setAuditOps] = useState<ApprovalAuditOpsReport | null>(null);

  useEffect(() => {
    // Fetch readyz status
    fetch("/api/readyz").then((r) => r.json()).then(setHealth);
    fetch("/api/system/approval-audit?windowDays=7")
      .then((r) => r.json())
      .then(setAuditOps)
      .catch(() => null);

    // Would fetch system_status from an API in production
    // For now, display what we have
  }, []);

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
      </div>
    </div>
  );
}
