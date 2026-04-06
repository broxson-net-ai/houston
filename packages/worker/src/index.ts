import "dotenv/config";

import { scanSkills } from "./skills-scanner.js";
import { HoustonScheduler } from "./scheduler.js";
import { GatewayClient } from "./gateway.js";
import { createShutdownHandler } from "./shutdown.js";
import { db } from "@houston/shared";

const SKILLS_PATH = process.env.OPENCLAW_SKILLS_PATH ?? "";
const SKILLS_SCAN_INTERVAL_MS = 60_000;

async function main() {
  console.log("[worker] Houston control-plane worker started");

  if (SKILLS_PATH) {
    try {
      await scanSkills(SKILLS_PATH);
      console.log("[worker] Skills scan complete");
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Skills scan failed: ${errorText}`);
    }
    setInterval(async () => {
      try {
        await scanSkills(SKILLS_PATH);
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        console.error(`[worker] Skills re-scan failed: ${errorText}`);
      }
    }, SKILLS_SCAN_INTERVAL_MS);
  } else {
    console.warn("[worker] OPENCLAW_SKILLS_PATH not set; skills scanner disabled");
  }

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  let gatewayClient: GatewayClient | undefined;
  if (gatewayUrl) {
    gatewayClient = new GatewayClient();
    try {
      await gatewayClient.connect(gatewayUrl, gatewayToken);
      console.log("[worker] Gateway connected");
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Gateway connection failed (continuing): ${errorText}`);
    }
  }

  const HEARTBEAT_KEY = "gateway_last_heartbeat";
  const HEARTBEAT_INTERVAL_MS = 15_000;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const writeHeartbeat = async () => {
    if (!gatewayClient || !gatewayClient.isConnected()) return;
    const timestamp = new Date().toISOString();
    await db.systemStatus.upsert({
      where: { key: HEARTBEAT_KEY },
      create: { key: HEARTBEAT_KEY, value: { timestamp } },
      update: { value: { timestamp } },
    });
  };

  if (gatewayClient) {
    heartbeatTimer = setInterval(() => {
      writeHeartbeat().catch((err) => {
        const errorText = err instanceof Error ? err.message : String(err);
        console.error(`[worker] Failed to write gateway heartbeat: ${errorText}`);
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  const scheduler = new HoustonScheduler();
  await scheduler.start();

  const shutdown = createShutdownHandler({
    scheduler,
    heartbeatTimer,
    approvalResumeTimer: null,
    trustVerifyTimer: null,
    approvalAuditHealthTimer: null,
    runTimeoutWatchdogTimer: null,
    gatewayClient,
  });

  process.on("SIGINT", () => {
    shutdown("SIGINT").catch((err) => {
      console.error("[worker] Shutdown error:", err);
      process.exit(1);
    });
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch((err) => {
      console.error("[worker] Shutdown error:", err);
      process.exit(1);
    });
  });
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
