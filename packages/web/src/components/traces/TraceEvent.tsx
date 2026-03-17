"use client";

import { JsonViewer } from "./JsonViewer";
import type { TraceRow } from "@/lib/traces-db";

const EVENT_COLORS: Record<string, string> = {
  classification:   "bg-blue-100 text-blue-800",
  source_selection: "bg-amber-100 text-amber-800",
  answer_source:    "bg-emerald-100 text-emerald-800",
};

const HOOK_ICONS: Record<string, string> = {
  "request-classifier":  "🔍",
  "project-activator":   "📁",
  "memory-qdrant":       "🧠",
};

function formatTs(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3,
  });
}

type Props = { event: TraceRow };

export function TraceEvent({ event }: Props) {
  const badgeClass = EVENT_COLORS[event.event_type] ?? "bg-slate-100 text-slate-700";
  const icon = HOOK_ICONS[event.hook_name] ?? "⚙️";

  return (
    <div className="bg-card border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base" aria-hidden>{icon}</span>
        <span className="font-medium text-sm">{event.hook_name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>
          {event.event_type}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {formatTs(event.created_at)}
        </span>
      </div>
      <JsonViewer data={event.data} initialExpanded={false} />
    </div>
  );
}
