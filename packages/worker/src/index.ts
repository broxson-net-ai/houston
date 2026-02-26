import { scanSkills } from "./skills-scanner.js";
import { HoustonScheduler } from "./scheduler.js";
import { GatewayClient } from "./gateway.js";
import { DispatchService } from "./dispatcher.js";
import { GatewayEventHandler } from "./events.js";

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
      console.error("[worker] Skills scan failed:", err);
    }
    setInterval(async () => {
      try {
        await scanSkills(SKILLS_PATH);
      } catch (err) {
        console.error("[worker] Skills re-scan failed:", err);
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
      console.error("[worker] Gateway connection failed (will retry):", err);
    }
  } else {
    console.warn("[worker] OPENCLAW_GATEWAY_URL not set; gateway client disabled");
  }

  // Dispatcher
  const dispatchService = new DispatchService(gatewayClient);

  // Event handler
  if (gatewayClient) {
    const eventHandler = new GatewayEventHandler(gatewayClient);
    eventHandler.start();
  }

  // Scheduler
  const scheduler = new HoustonScheduler(dispatchService);
  await scheduler.start();
  console.log("[worker] Scheduler started");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, shutting down...`);
    await scheduler.stop();
    if (gatewayClient) {
      gatewayClient.disconnect();
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
