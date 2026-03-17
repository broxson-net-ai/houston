import { TraceEvent } from "./TraceEvent";
import type { TraceRow } from "@/lib/traces-db";

type Props = { events: TraceRow[] };

export function TraceTimeline({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-muted-foreground text-sm">No events found.</p>;
  }

  return (
    <div className="relative">
      {/* Vertical connecting line */}
      <div className="absolute left-4 top-4 bottom-4 w-px bg-border" aria-hidden />
      <div className="space-y-3">
        {events.map((event, i) => (
          <div key={event.id} className="relative flex gap-3 items-start">
            {/* Timeline dot */}
            <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-card border-2 border-border flex items-center justify-center text-xs font-bold text-muted-foreground">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <TraceEvent event={event} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
