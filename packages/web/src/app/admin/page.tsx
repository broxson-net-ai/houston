"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";

type SystemStatus = {
  key: string;
  value: { timestamp?: string; count?: number; [key: string]: unknown };
  updatedAt: string;
};

export default function AdminPage() {
  const [statuses, setStatuses] = useState<Record<string, SystemStatus>>({});
  const [health, setHealth] = useState<Record<string, string>>({});

  useEffect(() => {
    // Fetch readyz status
    fetch("/api/readyz").then((r) => r.json()).then(setHealth);

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
      </div>
    </div>
  );
}
