"use client";

import { useEffect, useState } from "react";

type SyncState = {
  control: {
    enabled: boolean;
    updatedAt?: string;
    updatedBy?: string;
  };
  report: {
    ranAt?: string;
    createdTasks?: number;
    updatedTasks?: number;
    createdProjects?: number;
    eligibleAutoDispatchTasks?: number;
    skippedQueueItems?: string[];
  } | null;
};

export default function PortfolioProcessingControls() {
  const [state, setState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const res = await fetch("/api/system/portfolio-sync", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setState(data);
  }

  useEffect(() => {
    refresh().catch(() => null);
  }, []);

  async function toggle(enabled: boolean) {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/system/portfolio-sync", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update processing switch");
      await refresh();
      setMessage(enabled ? "Auto-processing enabled." : "Auto-processing paused.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update setting");
    } finally {
      setLoading(false);
    }
  }

  async function syncNow() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/system/portfolio-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      if (!res.ok) throw new Error("Failed to run sync");
      const data = await res.json();
      setState(data);
      setMessage("Portfolio sync completed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to run sync");
    } finally {
      setLoading(false);
    }
  }

  const enabled = state?.control.enabled ?? true;

  return (
    <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            disabled={loading}
            onChange={(e) => toggle(e.target.checked)}
          />
          Auto-processing enabled
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={syncNow}
          className="rounded border px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50"
        >
          Sync now
        </button>
      </div>
      <div>
        {state?.report?.ranAt ? `Last sync: ${new Date(state.report.ranAt).toLocaleString()}` : "Last sync: not yet run"}
      </div>
      {state?.report ? (
        <div>
          Projects +{state.report.createdProjects ?? 0} · Tasks +{state.report.createdTasks ?? 0} · Updated {state.report.updatedTasks ?? 0}
        </div>
      ) : null}
      {state?.report ? (
        <div>
          Eligible for auto-run: {state.report.eligibleAutoDispatchTasks ?? 0}
        </div>
      ) : null}
      {message ? <div className="text-foreground">{message}</div> : null}
    </div>
  );
}
