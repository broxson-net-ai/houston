import { Pool } from "pg";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.CORE_DATABASE_URL;
    if (!url) throw new Error("CORE_DATABASE_URL is not configured");
    _pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 });
  }
  return _pool;
}

export type TraceRow = {
  id: string;
  trace_id: string;
  hook_name: string;
  event_type: string;
  project_id: string | null;
  session_key: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

export type TraceSummaryRow = {
  trace_id: string;
  started_at: string;
  ended_at: string;
  event_count: number;
  project_id: string | null;
  session_key: string | null;
  request_type: string | null;
  captured_scope: string | null;
};

export type ListTracesOptions = {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  projectId?: string;
  traceId?: string;
  eventType?: string;
  hookName?: string;
};

export type ListTracesResult = {
  rows: TraceSummaryRow[];
  total: number;
  hasMore: boolean;
};

export async function listTraces(opts: ListTracesOptions = {}): Promise<ListTracesResult> {
  const pool = getPool();
  const { limit = 50, offset = 0, startDate, endDate, projectId, traceId, eventType, hookName } = opts;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (startDate) { conditions.push(`created_at >= $${idx++}`); params.push(startDate); }
  if (endDate)   { conditions.push(`created_at <= $${idx++}`); params.push(endDate); }
  if (projectId) { conditions.push(`project_id ILIKE $${idx++}`); params.push(`%${projectId}%`); }
  if (traceId)   { conditions.push(`trace_id::text ILIKE $${idx++}`); params.push(`%${traceId}%`); }
  if (eventType) { conditions.push(`event_type = $${idx++}`); params.push(eventType); }
  if (hookName)  { conditions.push(`hook_name = $${idx++}`); params.push(hookName); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countResult, rows] = await Promise.all([
    pool.query<{ n: number }>(
      `SELECT COUNT(DISTINCT trace_id)::int AS n FROM ocmem.routing_traces ${where}`,
      params
    ),
    pool.query<TraceSummaryRow>(
      `SELECT
         trace_id::text AS trace_id,
         MIN(created_at) AS started_at,
         MAX(created_at) AS ended_at,
         COUNT(*)::int AS event_count,
         MAX(project_id) AS project_id,
         MAX(session_key) AS session_key,
         MAX(CASE WHEN event_type = 'classification' THEN data->>'requestType' END) AS request_type,
         MAX(CASE WHEN event_type = 'answer_source'  THEN data->>'capturedScope' END) AS captured_scope
       FROM ocmem.routing_traces
       ${where}
       GROUP BY trace_id
       ORDER BY MIN(created_at) DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    ),
  ]);

  const total = countResult.rows[0]?.n ?? 0;
  return { rows: rows.rows, total, hasMore: offset + rows.rows.length < total };
}

export type TraceDetailResult = {
  events: TraceRow[];
  summary: {
    traceId: string;
    eventCount: number;
    startedAt: string | null;
    endedAt: string | null;
    durationMs: number | null;
    projectId: string | null;
    sessionKey: string | null;
    requestType: string | null;
    sources: string[];
    capturedScope: string | null;
  };
};

export async function getTraceDetail(traceId: string): Promise<TraceDetailResult | null> {
  const pool = getPool();
  const result = await pool.query<TraceRow>(
    `SELECT id, trace_id::text AS trace_id, hook_name, event_type, project_id, session_key, data, created_at
     FROM ocmem.routing_traces
     WHERE trace_id::text = $1
     ORDER BY created_at ASC`,
    [traceId]
  );

  if (result.rows.length === 0) return null;

  const events = result.rows;
  const startedAt = events[0]?.created_at ?? null;
  const endedAt = events[events.length - 1]?.created_at ?? null;
  const durationMs = startedAt && endedAt
    ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
    : null;

  const classificationEvent = events.find((e) => e.event_type === "classification");
  const answerEvent = events.find((e) => e.event_type === "answer_source");

  const sources = events
    .filter((e) => e.event_type === "source_selection")
    .map((e) => (e.data as any)?.sourceType ?? e.hook_name)
    .filter(Boolean);

  return {
    events,
    summary: {
      traceId,
      eventCount: events.length,
      startedAt,
      endedAt,
      durationMs,
      projectId: events[0]?.project_id ?? null,
      sessionKey: events[0]?.session_key ?? null,
      requestType: (classificationEvent?.data as any)?.requestType ?? null,
      sources,
      capturedScope: (answerEvent?.data as any)?.capturedScope ?? null,
    },
  };
}

export type TracesSummaryResult = {
  totalDistinctTraces: number;
  byEventType: Record<string, number>;
  byRequestType: Record<string, number>;
  byCapturedScope: Record<string, number>;
  period: { start: string | null; end: string | null };
};

export async function getTracesSummary(
  opts: { startDate?: string; endDate?: string } = {}
): Promise<TracesSummaryResult> {
  const pool = getPool();
  const { startDate, endDate } = opts;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (startDate) { conditions.push(`created_at >= $${idx++}`); params.push(startDate); }
  if (endDate)   { conditions.push(`created_at <= $${idx++}`); params.push(endDate); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [distinctRes, byTypeRes, byReqTypeRes, byScopeRes, periodRes] = await Promise.all([
    pool.query<{ n: number }>(
      `SELECT COUNT(DISTINCT trace_id)::int AS n FROM ocmem.routing_traces ${where}`,
      params
    ),
    pool.query<{ event_type: string; n: number }>(
      `SELECT event_type, COUNT(*)::int AS n FROM ocmem.routing_traces ${where} GROUP BY event_type`,
      params
    ),
    pool.query<{ rt: string; n: number }>(
      `SELECT data->>'requestType' AS rt, COUNT(DISTINCT trace_id)::int AS n
       FROM ocmem.routing_traces
       WHERE event_type = 'classification'${conditions.length ? " AND " + conditions.join(" AND ") : ""}
       GROUP BY data->>'requestType'`,
      params
    ),
    pool.query<{ scope: string; n: number }>(
      `SELECT data->>'capturedScope' AS scope, COUNT(*)::int AS n
       FROM ocmem.routing_traces
       WHERE event_type = 'answer_source'${conditions.length ? " AND " + conditions.join(" AND ") : ""}
       GROUP BY data->>'capturedScope'`,
      params
    ),
    pool.query<{ start: string; end: string }>(
      `SELECT MIN(created_at) AS start, MAX(created_at) AS end FROM ocmem.routing_traces ${where}`,
      params
    ),
  ]);

  const byEventType: Record<string, number> = {};
  for (const row of byTypeRes.rows) byEventType[row.event_type] = row.n;

  const byRequestType: Record<string, number> = {};
  for (const row of byReqTypeRes.rows) if (row.rt) byRequestType[row.rt] = row.n;

  const byCapturedScope: Record<string, number> = {};
  for (const row of byScopeRes.rows) if (row.scope) byCapturedScope[row.scope] = row.n;

  return {
    totalDistinctTraces: distinctRes.rows[0]?.n ?? 0,
    byEventType,
    byRequestType,
    byCapturedScope,
    period: { start: periodRes.rows[0]?.start ?? null, end: periodRes.rows[0]?.end ?? null },
  };
}
