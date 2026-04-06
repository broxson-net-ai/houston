"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";

export default function AdminPage() {
  const [health, setHealth] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/readyz")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError("Failed to load readiness status"));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground">Control-plane diagnostics and operational health.</p>
        </div>

        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <h2 className="font-semibold">System Health</h2>
            {Object.entries(health).length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              Object.entries(health).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{key}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${value === "ok" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {value}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-2">
            <h2 className="font-semibold">Control Plane</h2>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div>Projects, work items, approvals, audits, and exports are now the active operational surfaces.</div>
              <div>Retired task/template/schedule runtime paths have been removed.</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          The retired task/template/schedule system has been removed from active operation. Use the control-plane project, work-item, approval, export, and audit views for administration.
        </div>
      </div>
    </div>
  );
}
