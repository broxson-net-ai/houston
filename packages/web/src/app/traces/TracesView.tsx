"use client";

import { useState, useEffect, useCallback } from "react";
import { TraceFilters, type FilterValues } from "@/components/traces/TraceFilters";
import { TraceCard } from "@/components/traces/TraceCard";
import { SourceSummaryWidget } from "@/components/traces/SourceSummaryWidget";
import type { TraceSummaryRow, TracesSummaryResult } from "@/lib/traces-db";

const PAGE_SIZE = 50;

export default function TracesView() {
  const [filters, setFilters] = useState<FilterValues>({
    startDate: "", endDate: "", projectId: "", traceId: "", requestType: "",
  });
  const [traces, setTraces] = useState<TraceSummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TracesSummaryResult | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const fetchTraces = useCallback(async (f: FilterValues, off: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
      if (f.startDate) params.set("startDate", f.startDate);
      if (f.endDate)   params.set("endDate", f.endDate);
      if (f.projectId) params.set("projectId", f.projectId);
      if (f.traceId)   params.set("traceId", f.traceId);
      if (f.requestType) params.set("eventType", "classification"); // filter by classification type

      const res = await fetch(`/api/traces?${params}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      if (off === 0) {
        setTraces(data.rows ?? []);
      } else {
        setTraces((prev) => [...prev, ...(data.rows ?? [])]);
      }
      setTotal(data.total ?? 0);
      setHasMore(data.hasMore ?? false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load traces");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSummary = useCallback(async (f: FilterValues) => {
    try {
      const params = new URLSearchParams();
      if (f.startDate) params.set("startDate", f.startDate);
      if (f.endDate)   params.set("endDate", f.endDate);
      const res = await fetch(`/api/traces/summary?${params}`);
      if (res.ok) setSummary(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    setOffset(0);
    fetchTraces(filters, 0);
    fetchSummary(filters);
  }, [filters, fetchTraces, fetchSummary]);

  function handleFiltersChange(f: FilterValues) {
    setFilters(f);
    setOffset(0);
  }

  function loadMore() {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    fetchTraces(filters, next);
  }

  return (
    <div className="space-y-6">
      <TraceFilters onChange={handleFiltersChange} />

      {/* Summary toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowSummary((v) => !v)}
          className="text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          {showSummary ? "▾ Hide summary" : "▸ Show summary"}
        </button>
        {!loading && (
          <span className="text-sm text-muted-foreground">
            {total} trace{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {showSummary && summary && (
        <SourceSummaryWidget summary={summary} />
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => fetchTraces(filters, 0)}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {loading && traces.length === 0 && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {!loading && traces.length === 0 && !error && (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-muted-foreground text-sm">No traces found.</p>
          <p className="text-muted-foreground text-xs mt-1">
            Traces are recorded when OpenClaw processes requests with the operating model plugins.
          </p>
        </div>
      )}

      {traces.length > 0 && (
        <div className="space-y-2">
          {traces.map((trace) => (
            <TraceCard key={trace.trace_id} trace={trace} />
          ))}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="w-full py-2 text-sm text-muted-foreground hover:text-primary border rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
