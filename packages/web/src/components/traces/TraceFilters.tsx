"use client";

import { useState } from "react";

export type FilterValues = {
  startDate: string;
  endDate: string;
  projectId: string;
  traceId: string;
  requestType: string;
};

const EMPTY: FilterValues = {
  startDate: "",
  endDate: "",
  projectId: "",
  traceId: "",
  requestType: "",
};

type Props = {
  initial?: Partial<FilterValues>;
  onChange: (filters: FilterValues) => void;
};

export function TraceFilters({ initial = {}, onChange }: Props) {
  const [filters, setFilters] = useState<FilterValues>({ ...EMPTY, ...initial });

  function update(key: keyof FilterValues, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    onChange(next);
  }

  function reset() {
    setFilters(EMPTY);
    onChange(EMPTY);
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 bg-card border rounded-lg">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground font-medium">From</label>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => update("startDate", e.target.value)}
          className="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground font-medium">To</label>
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => update("endDate", e.target.value)}
          className="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground font-medium">Request type</label>
        <select
          value={filters.requestType}
          onChange={(e) => update("requestType", e.target.value)}
          className="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All</option>
          <option value="semantic">Semantic</option>
          <option value="procedural">Procedural</option>
          <option value="project-activation">Project activation</option>
        </select>
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-32">
        <label className="text-xs text-muted-foreground font-medium">Project ID</label>
        <input
          type="text"
          placeholder="filter by project…"
          value={filters.projectId}
          onChange={(e) => update("projectId", e.target.value)}
          className="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-40">
        <label className="text-xs text-muted-foreground font-medium">Trace ID</label>
        <input
          type="text"
          placeholder="search by trace id…"
          value={filters.traceId}
          onChange={(e) => update("traceId", e.target.value)}
          className="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      {hasFilters && (
        <button
          onClick={reset}
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-primary border rounded transition-colors"
        >
          Reset
        </button>
      )}
    </div>
  );
}
