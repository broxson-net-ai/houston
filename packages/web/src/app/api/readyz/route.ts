import { NextResponse } from "next/server";
import { db } from "@houston/shared";

export async function GET() {
  const status: Record<string, string> = {};
  let httpStatus = 200;

  // Check DB
  try {
    await db.$queryRaw`SELECT 1`;
    status.db = "ok";
  } catch {
    status.db = "degraded";
    httpStatus = 503;
  }

  // Check gateway last heartbeat
  try {
    const gatewayStatus = await db.systemStatus.findUnique({
      where: { key: "gateway_last_heartbeat" },
    });
    if (gatewayStatus) {
      const lastBeat = new Date((gatewayStatus.value as { timestamp: string }).timestamp);
      const ageMs = Date.now() - lastBeat.getTime();
      status.gateway = ageMs < 60_000 ? "ok" : "degraded";
    } else {
      status.gateway = "unknown";
    }
  } catch {
    status.gateway = "unknown";
  }

  return NextResponse.json(status, { status: httpStatus });
}
