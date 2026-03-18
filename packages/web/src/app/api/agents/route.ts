import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type RuntimeAgentInventory = {
  ids: string[];
};

function parseAgentIdFromRoutingKey(routingKey: string): string | null {
  const match = String(routingKey || "").trim().toLowerCase().match(/^agent:([^:]+):/);
  return match?.[1] ?? null;
}

async function readRuntimeAgentInventory(): Promise<RuntimeAgentInventory | null> {
  const openclawHome = process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw");
  const configPath = path.join(openclawHome, "openclaw.json");

  try {
    const raw = await fs.readFile(configPath, "utf8");
    const cfg = JSON.parse(raw) as {
      agents?: {
        list?: Array<{ id?: unknown }>;
      };
    };

    const ids = (cfg.agents?.list ?? [])
      .map((entry) => (typeof entry?.id === "string" ? entry.id.trim().toLowerCase() : ""))
      .filter(Boolean);

    if (!ids.length) return null;
    return { ids: Array.from(new Set(ids)) };
  } catch {
    return null;
  }
}

async function syncRuntimeAgentsToDb(runtimeIds: string[]) {
  const dbAgents = await db.agent.findMany({ orderBy: { createdAt: "asc" } });
  const existingRuntimeIds = new Set(
    dbAgents
      .map((agent) => parseAgentIdFromRoutingKey(agent.routingKey))
      .filter((id): id is string => Boolean(id)),
  );

  const missingIds = runtimeIds.filter((id) => !existingRuntimeIds.has(id));
  if (!missingIds.length) return;

  for (const id of missingIds) {
    await db.agent.create({
      data: {
        name: id,
        routingKey: `agent:${id}:main`,
        avatarUrl: null,
        tags: ["runtime", "auto-synced"],
        enabled: true,
      },
    });
  }
}

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const runtime = await readRuntimeAgentInventory();
  if (runtime?.ids.length) {
    await syncRuntimeAgentsToDb(runtime.ids);
  }

  const agents = await db.agent.findMany({ orderBy: { createdAt: "asc" } });
  const runtimeIds = new Set(runtime?.ids ?? []);

  const enriched = agents.map((agent) => {
    const parsedId = parseAgentIdFromRoutingKey(agent.routingKey);
    const runtimePresent = parsedId ? runtimeIds.has(parsedId) : null;
    const stale = runtimePresent === false;
    return {
      ...agent,
      runtimePresent,
      stale,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const { name, routingKey, avatarUrl, tags, enabled } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!routingKey || typeof routingKey !== "string") {
    return NextResponse.json({ error: "routingKey is required" }, { status: 400 });
  }

  const agent = await db.agent.create({
    data: {
      name,
      routingKey,
      avatarUrl: avatarUrl ?? null,
      tags: tags ?? [],
      enabled: enabled !== false,
    },
  });

  return NextResponse.json(agent, { status: 201 });
}
