"use client";

import { useEffect, useMemo, useState } from "react";

type SkillBreakdown = {
  skill_name: string;
  count: number;
  last_used: string;
};

type AgentBreakdown = {
  agent_id: string;
  count: number;
  last_used: string;
};

type SkillUsageResponse = {
  totalEvents: number;
  eventsLast24h: number;
  bySkill: SkillBreakdown[];
  byAgent: AgentBreakdown[];
  degraded: boolean;
  degradedReason?: string;
};

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function UsageBars({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<SkillBreakdown | AgentBreakdown>;
  empty: string;
}) {
  const max = rows[0]?.count ?? 0;

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <h3 className="text-base font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm italic text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {rows.map((row) => {
            const label = "skill_name" in row ? row.skill_name : row.agent_id;
            const percent = max > 0 ? Math.max(8, Math.round((row.count / max) * 100)) : 0;
            return (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-mono" title={label}>{label}</span>
                  <span className="tabular-nums text-muted-foreground">{row.count.toLocaleString()}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Last used {new Date(row.last_used).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SkillUsageView() {
  const [data, setData] = useState<SkillUsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetch("/api/skills/usage")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<SkillUsageResponse>;
      })
      .then((payload) => {
        if (!active) return;
        setData(payload);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const topSkill = useMemo(() => data?.bySkill[0] ?? null, [data]);

  if (loading) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading usage telemetry...</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Failed to load usage telemetry: {error}</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Skill Usage</h2>
        <p className="text-sm text-muted-foreground">
          Runtime usage from the skill-tracker extension, grouped by skill and agent.
        </p>
      </div>

      {data.degraded ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          Skill usage is degraded. {data.degradedReason ?? "Database connectivity is unavailable."}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Invocations" value={data.totalEvents.toLocaleString()} />
        <StatCard label="Last 24 Hours" value={data.eventsLast24h.toLocaleString()} />
        <StatCard label="Tracked Skills" value={data.bySkill.length} />
        <StatCard
          label="Top Skill"
          value={topSkill?.skill_name ?? "None"}
          sub={topSkill ? `${topSkill.count.toLocaleString()} invocations` : "No recorded usage"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <UsageBars title="Top Skills" rows={data.bySkill} empty="No skill invocations recorded yet." />
        <UsageBars title="Usage by Agent" rows={data.byAgent} empty="No agent usage records available yet." />
      </div>
    </section>
  );
}
