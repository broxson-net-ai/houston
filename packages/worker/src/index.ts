/Users/openclaw/projects/houston-fork/packages/worker/src/index.ts
import "dotenv/config";

import { scanSkills } from "./skills-scanner.js";
import { HoustonScheduler } from "./scheduler.js";
import { GatewayClient } from "./gateway.js";
import { DispatchService } from "./dispatcher.js";
import { GatewayEventHandler } from "./events.js";
import { db } from "@houston/shared";

const SKILLS_PATH = process.env.OPENCLAW_SKILLS_PATH ?? "";
const SKILLS_SCAN_INTERVAL_MS = 60_000;

async function main() {
  console.log("[worker] Houston worker started");

  // Skills scanner
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

  // Gateway client
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
      console.error(`[worker] Gateway connection failed (will retry): ${errorText}`);
    }
  } else {
    console.warn("[worker] OPENCLAW_GATEWAY_URL not set; gateway client disabled");
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

  // Dispatcher
  const dispatchService = new DispatchService(gatewayClient);

  // Event handler
  let eventHandler: GatewayEventHandler | undefined;
  if (gatewayClient) {
    eventHandler = new GatewayEventHandler(gatewayClient);
    eventHandler.start();
  }

  // Log cleanup task (run on startup and then daily)

  // Scheduler
  const scheduler = new HoustonScheduler(dispatchService);
  await scheduler.start();
  console.log("[worker] Scheduler started");

  // Log cleanup task (run on startup and then daily)
  const runLogCleanup = async () => {
    try {
      if (eventHandler) {
        await eventHandler.cleanupOldLogs();
      }
      await scheduler.cleanupOldLogs();
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Log cleanup failed: ${errorText}`);
    }
  };

  // Run initial cleanup
  await runLogCleanup();

  // Schedule daily log cleanup (run at 3 AM)
  const scheduleDailyCleanup = () => {
    const now = new Date() as any;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(3);
    tomorrow.setMinutes(0);
    tomorrow.setSeconds(0);
    tomorrow.setMilliseconds(0);
    const msUntilTomorrow = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      runLogCleanup();
      // Schedule next cleanup
      scheduleDailyCleanup();
    }, msUntilTomorrow);
  };

  scheduleDailyCleanup();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, shutting down...`);

    try {
      await scheduler.stop();
      console.log("[worker] Scheduler stopped");
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Failed to stop scheduler: ${errorText}`);
    }

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      console.log("[worker] Heartbeat timer stopped");
    }

    if (gatewayClient) {
      try {
        gatewayClient.disconnect();
        console.log("[worker] Gateway disconnected");
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        console.error(`[worker] Failed to disconnect gateway: ${errorText}`);
      }
    }

    console.log("[worker] Shutdown complete, exiting...");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Handle uncaught errors
  process.on("uncaughtException", (err) => {
    const errorText = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Uncaught exception: ${errorText}`);
    console.error(err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error(`[worker] Unhandled rejection at ${promise}:`, reason);
    process.exit(1);
  });
}

main().catch((err) => {
  const errorText = err instanceof Error ? err.message : String(err);
  console.error(`[worker] Fatal error: ${errorText}`);
  console.error(err);
  process.exit(1);
});
