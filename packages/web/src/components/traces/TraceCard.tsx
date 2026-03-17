import Link from "next/link";
import type { TraceSummaryRow } from "@/lib/traces-db";

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function shortId(id: string): string {
  return id.slice(0, 8) + "…";
}

const REQUEST_TYPE_COLORS: Record<string, string> = {
  semantic:           "bg-blue-100 text-blue-800",
  procedural:         "bg-purple-100 text-purple-800",
  "project-activation": "bg-green-100 text-green-800",
};

type Props = { trace: TraceSummaryRow };

export function TraceCard({ trace }: Props) {
  const badgeClass = REQUEST_TYPE_COLORS[trace.request_type ?? ""] ?? "bg-slate-100 text-slate-700";
  const durationMs = trace.ended_at && trace.started_at
    ? new Date(trace.ended_at).getTime() - new Date(trace.started_at).getTime()
    : null;

  return (
    <Link
      href={`/traces/${trace.trace_id}`}
      className="block bg-card border rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono text-muted-foreground">
              {shortId(trace.trace_id)}
            </code>
            {trace.request_type && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>
                {trace.request_type}
              </span>
            )}
            {trace.project_id && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-medium">
                {trace.project_id}
              </span>
            )}
          </div>
          {trace.captured_scope && (
            <p className="text-xs text-muted-foreground">
              captured → <span className="font-mono">{trace.captured_scope}</span>
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0 space-y-1">
          <p className="text-xs text-muted-foreground">{formatTs(trace.started_at)}</p>
          <p className="text-xs text-muted-foreground">
            {trace.event_count} event{trace.event_count !== 1 ? "s" : ""}
            {durationMs !== null && ` · ${durationMs}ms`}
          </p>
        </div>
      </div>
    </Link>
  );
}
