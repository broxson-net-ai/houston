import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { TraceTimeline } from "@/components/traces/TraceTimeline";
import { getTraceDetail } from "@/lib/traces-db";

type Props = { params: Promise<{ traceId: string }> };

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    dateStyle: "medium", timeStyle: "medium",
  });
}

export default async function TraceDetailPage({ params }: Props) {
  const { traceId } = await params;
  let detail;
  try {
    detail = await getTraceDetail(traceId);
  } catch {
    detail = null;
  }

  if (!detail) notFound();

  const { events, summary } = detail;

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        {/* Back */}
        <Link
          href="/traces"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          ← Back to traces
        </Link>

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold font-mono break-all">{traceId}</h1>
          <p className="text-sm text-muted-foreground">
            {summary.eventCount} event{summary.eventCount !== 1 ? "s" : ""}
            {summary.durationMs !== null && ` · ${summary.durationMs}ms`}
            {summary.startedAt && ` · ${formatTs(summary.startedAt)}`}
          </p>
        </div>

        {/* Summary card */}
        <div className="bg-card border rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Request type</p>
            <p className="font-medium">{summary.requestType ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Project</p>
            <p className="font-medium font-mono text-xs truncate">{summary.projectId ?? "none"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Sources used</p>
            <p className="font-medium">{summary.sources.join(", ") || "none"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Captured to</p>
            <p className="font-medium font-mono text-xs truncate">{summary.capturedScope ?? "none"}</p>
          </div>
        </div>

        {/* Timeline */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Event timeline</h2>
          <TraceTimeline events={events} />
        </div>
      </div>
    </div>
  );
}
