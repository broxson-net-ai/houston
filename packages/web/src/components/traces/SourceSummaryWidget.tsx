import type { TracesSummaryResult } from "@/lib/traces-db";

const EVENT_TYPE_LABELS: Record<string, string> = {
  classification:   "Classifications",
  source_selection: "Source selections",
  answer_source:    "Captures",
};

function StatCard({
  label, value, sub, color,
}: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className={`rounded-lg border p-4 space-y-1 ${color}`}>
      <p className="text-xs font-medium text-current/70">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-current/60">{sub}</p>}
    </div>
  );
}

type Props = { summary: TracesSummaryResult };

export function SourceSummaryWidget({ summary }: Props) {
  const { totalDistinctTraces, byEventType, byRequestType, byCapturedScope, period } = summary;

  const totalCaptures = byEventType["answer_source"] ?? 0;

  return (
    <div className="space-y-4">
      {/* Top-line stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Distinct traces" value={totalDistinctTraces} color="bg-slate-50 text-slate-800" />
        <StatCard label="Total events" value={Object.values(byEventType).reduce((a, b) => a + b, 0)} color="bg-blue-50 text-blue-800" />
        <StatCard label="Captures" value={totalCaptures} color="bg-emerald-50 text-emerald-800" />
        <StatCard
          label="Period"
          value={period.start ? new Date(period.start).toLocaleDateString() === new Date(period.end!).toLocaleDateString() ? 1 : Math.round((new Date(period.end!).getTime() - new Date(period.start).getTime()) / 86400000) : 0}
          sub={period.start ? `${new Date(period.start).toLocaleDateString()} – ${new Date(period.end!).toLocaleDateString()}` : "no data"}
          color="bg-purple-50 text-purple-800"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Events by type */}
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Events by type</h3>
          <div className="space-y-2">
            {Object.entries(byEventType).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{EVENT_TYPE_LABELS[type] ?? type}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
            {Object.keys(byEventType).length === 0 && (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </div>
        </div>

        {/* Request types */}
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">By request type</h3>
          <div className="space-y-2">
            {Object.entries(byRequestType).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{type}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
            {Object.keys(byRequestType).length === 0 && (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </div>
        </div>

        {/* Captured scopes */}
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Capture destinations</h3>
          <div className="space-y-2">
            {Object.entries(byCapturedScope).map(([scope, count]) => (
              <div key={scope} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-mono text-xs truncate max-w-32" title={scope}>{scope}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
            {Object.keys(byCapturedScope).length === 0 && (
              <p className="text-sm text-muted-foreground">No captures yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
