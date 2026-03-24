import { NextResponse } from "next/server";
import { Pool } from "pg";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.SKILL_TRACKER_DATABASE_URL ?? process.env.CORE_DATABASE_URL;
    if (!url) {
      throw new Error("SKILL_TRACKER_DATABASE_URL or CORE_DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000 });
  }
  return pool;
}

export type SkillBreakdown = {
  skill_name: string;
  count: number;
  last_used: string;
};

export type AgentBreakdown = {
  agent_id: string;
  count: number;
  last_used: string;
};

export type SkillUsageResponse = {
  totalEvents: number;
  eventsLast24h: number;
  bySkill: SkillBreakdown[];
  byAgent: AgentBreakdown[];
  degraded: boolean;
  degradedReason?: string;
};

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  const degradedResponse = (reason: string): SkillUsageResponse => ({
    totalEvents: 0,
    eventsLast24h: 0,
    bySkill: [],
    byAgent: [],
    degraded: true,
    degradedReason: reason,
  });

  try {
    const db = getPool();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [totalRes, last24hRes, bySkillRes, byAgentRes] = await Promise.all([
      db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM skill_usage_events"),
      db.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM skill_usage_events WHERE invoked_at >= $1",
        [since24h]
      ),
      db.query<SkillBreakdown>(
        `SELECT COALESCE(skill_name, 'unknown') AS skill_name,
                COUNT(*)::int AS count,
                MAX(invoked_at)::text AS last_used
         FROM skill_usage_events
         GROUP BY skill_name
         ORDER BY count DESC, skill_name ASC
         LIMIT 12`
      ),
      db.query<AgentBreakdown>(
        `SELECT COALESCE(agent_id, 'unknown') AS agent_id,
                COUNT(*)::int AS count,
                MAX(invoked_at)::text AS last_used
         FROM skill_usage_events
         GROUP BY agent_id
         ORDER BY count DESC, agent_id ASC
         LIMIT 12`
      ),
    ]);

    return NextResponse.json({
      totalEvents: totalRes.rows[0]?.n ?? 0,
      eventsLast24h: last24hRes.rows[0]?.n ?? 0,
      bySkill: bySkillRes.rows,
      byAgent: byAgentRes.rows,
      degraded: false,
    } satisfies SkillUsageResponse);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[/api/skills/usage] failed:", message);
    return NextResponse.json(degradedResponse(`Database unavailable: ${message}`));
  }
}
