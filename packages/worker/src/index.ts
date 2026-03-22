import "dotenv/config";
import { createHash } from "crypto";

import { scanSkills } from "./skills-scanner.js";
import { HoustonScheduler } from "./scheduler.js";
import { GatewayClient } from "./gateway.js";
import { DispatchService } from "./dispatcher.js";
import { GatewayEventHandler } from "./events.js";
import { createShutdownHandler } from "./shutdown.js";
import { db } from "@houston/shared";

const SKILLS_PATH = process.env.OPENCLAW_SKILLS_PATH ?? "";
const SKILLS_SCAN_INTERVAL_MS = 60_000;
const APPROVAL_RESUME_INTERVAL_MS = Number(process.env.APPROVAL_RESUME_INTERVAL_MS ?? "10000");
const TRUST_VERIFY_INTERVAL_MS = Number(process.env.HOUSTON_TRUST_VERIFY_INTERVAL_MS ?? "3600000");
const TRUST_VERIFY_WINDOW_HOURS = Number(process.env.HOUSTON_TRUST_VERIFY_WINDOW_HOURS ?? "48");
const OPS_ALERT_WEBHOOK_URL = process.env.HOUSTON_OPS_ALERT_WEBHOOK_URL ?? "";
const OPS_ALERT_MIN_INTERVAL_MS = Number(process.env.HOUSTON_OPS_ALERT_MIN_INTERVAL_MS ?? "900000");
const TRUST_LAST_ALERT_KEY = "trust_ladder_last_alert";
const APPROVAL_AUDIT_HEALTH_INTERVAL_MS = Number(process.env.HOUSTON_APPROVAL_AUDIT_HEALTH_INTERVAL_MS ?? "300000");
const APPROVAL_AUDIT_MAX_LAG_MINUTES = Number(process.env.HOUSTON_APPROVAL_AUDIT_MAX_LAG_MINUTES ?? "10");
const APPROVAL_AUDIT_SPIKE_WINDOW_HOURS = Number(process.env.HOUSTON_APPROVAL_AUDIT_SPIKE_WINDOW_HOURS ?? "24");
const APPROVAL_AUDIT_SPIKE_MIN_SAMPLES = Number(process.env.HOUSTON_APPROVAL_AUDIT_SPIKE_MIN_SAMPLES ?? "10");
const APPROVAL_AUDIT_AUTO_SPIKE_RATIO = Number(process.env.HOUSTON_APPROVAL_AUDIT_AUTO_SPIKE_RATIO ?? "0.75");
const APPROVAL_AUDIT_AUTO_SPIKE_DELTA = Number(process.env.HOUSTON_APPROVAL_AUDIT_AUTO_SPIKE_DELTA ?? "0.25");

function parseTrustModes(): Record<string, string> {
  const raw = process.env.HOUSTON_APPROVAL_TRUST_MODES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

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
  let approvalResumeTimer: ReturnType<typeof setInterval> | null = null;
  let trustVerifyTimer: ReturnType<typeof setInterval> | null = null;
  let approvalAuditHealthTimer: ReturnType<typeof setInterval> | null = null;

  const sendOpsAlert = async (kind: string, message: string, details: Record<string, unknown>) => {
    if (!OPS_ALERT_WEBHOOK_URL) return;

    const now = Date.now();
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ kind, message, details }))
      .digest("hex")
      .slice(0, 16);

    const last = await db.systemStatus.findUnique({ where: { key: TRUST_LAST_ALERT_KEY } });
    const lastValue = (last?.value ?? {}) as Record<string, unknown>;
    const lastFingerprint = typeof lastValue.fingerprint === "string" ? lastValue.fingerprint : "";
    const lastSentAtMs = typeof lastValue.sentAtMs === "number" ? lastValue.sentAtMs : 0;

    if (lastFingerprint === fingerprint && now - lastSentAtMs < Math.max(60_000, OPS_ALERT_MIN_INTERVAL_MS)) {
      return;
    }

    const body = {
      text: `[Houston] ${message}`,
      kind,
      details,
      timestamp: new Date(now).toISOString(),
    };

    const res = await fetch(OPS_ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`ops alert webhook failed: ${res.status}`);
    }

    await db.systemStatus.upsert({
      where: { key: TRUST_LAST_ALERT_KEY },
      create: {
        key: TRUST_LAST_ALERT_KEY,
        value: {
          kind,
          fingerprint,
          sentAtMs: now,
          sentAt: new Date(now).toISOString(),
        },
      },
      update: {
        value: {
          kind,
          fingerprint,
          sentAtMs: now,
          sentAt: new Date(now).toISOString(),
        },
      },
    });
  };

  const runTrustVerification = async () => {
    const now = Date.now();
    const since = new Date(now - Math.max(1, TRUST_VERIFY_WINDOW_HOURS) * 60 * 60 * 1000);
    const rows = await db.approvalRequest.findMany({
      where: { createdAt: { gte: since } },
      select: {
        trigger: true,
        decision: true,
        decider: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });

    const byTrigger = new Map<string, { total: number; autoApproved: number; manualApproved: number; pending: number; denied: number; revised: number }>();
    let autoApproved = 0;
    let manualApproved = 0;
    let pending = 0;
    let denied = 0;
    let revised = 0;

    for (const row of rows) {
      const trigger = row.trigger || "unknown";
      if (!byTrigger.has(trigger)) {
        byTrigger.set(trigger, { total: 0, autoApproved: 0, manualApproved: 0, pending: 0, denied: 0, revised: 0 });
      }
      const bucket = byTrigger.get(trigger)!;
      bucket.total += 1;

      if (row.decision === "APPROVED") {
        if (row.decider === "policy:trust-ladder") {
          autoApproved += 1;
          bucket.autoApproved += 1;
        } else {
          manualApproved += 1;
          bucket.manualApproved += 1;
        }
      } else if (row.decision === "PENDING") {
        pending += 1;
        bucket.pending += 1;
      } else if (row.decision === "DENIED") {
        denied += 1;
        bucket.denied += 1;
      } else if (row.decision === "REVISED") {
        revised += 1;
        bucket.revised += 1;
      }
    }

    const flaggedCriticalAuto = Array.from(byTrigger.entries())
      .filter(([trigger, bucket]) => ["destructive-op", "production-change", "service-restart", "config-change"].includes(trigger) && bucket.autoApproved > 0)
      .map(([trigger, bucket]) => ({ trigger, autoApproved: bucket.autoApproved }));

    const verification = {
      checkedAt: new Date(now).toISOString(),
      windowHours: Math.max(1, TRUST_VERIFY_WINDOW_HOURS),
      trustDefault: process.env.HOUSTON_APPROVAL_TRUST_DEFAULT ?? "always",
      trustModes: parseTrustModes(),
      total: rows.length,
      autoApproved,
      manualApproved,
      pending,
      denied,
      revised,
      flaggedCriticalAuto,
      byTrigger: Array.from(byTrigger.entries()).map(([trigger, bucket]) => ({ trigger, ...bucket })),
    };

    await db.systemStatus.upsert({
      where: { key: "trust_ladder_verification" },
      create: { key: "trust_ladder_verification", value: verification },
      update: { value: verification },
    });

    if (flaggedCriticalAuto.length > 0) {
      console.warn(`[worker] Trust verification warning: critical auto approvals detected (${JSON.stringify(flaggedCriticalAuto)})`);
      try {
        await sendOpsAlert(
          "trust-critical-auto",
          "Trust verification found auto approvals in critical triggers",
          {
            flaggedCriticalAuto,
            windowHours: Math.max(1, TRUST_VERIFY_WINDOW_HOURS),
            trustDefault: process.env.HOUSTON_APPROVAL_TRUST_DEFAULT ?? "always",
            trustModes: parseTrustModes(),
          }
        );
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        console.error(`[worker] Failed to send trust warning alert: ${errorText}`);
      }
    } else {
      console.log(`[worker] Trust verification ok: auto=${autoApproved} manual=${manualApproved} pending=${pending} denied=${denied} revised=${revised}`);
    }
  };

  const runApprovalAuditHealthCheck = async () => {
    const latestApproval = await db.approvalRequest.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, requestId: true, createdAt: true },
    });

    const latestAudit = await db.approvalAuditEvent.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, requestId: true, createdAt: true },
    });

    const lastWriteError = await db.systemStatus.findUnique({ where: { key: "approval_audit_last_write_error" } });
    const rotationError = await db.systemStatus.findUnique({ where: { key: "approval_audit_rotation_error" } });

    const lagMs = latestApproval
      ? Math.max(0, latestApproval.createdAt.getTime() - (latestAudit?.createdAt?.getTime() ?? 0))
      : 0;
    const lagMinutes = Math.round(lagMs / 60000);
    const stale = lagMinutes > Math.max(1, APPROVAL_AUDIT_MAX_LAG_MINUTES);

    const status = {
      checkedAt: new Date().toISOString(),
      maxLagMinutes: APPROVAL_AUDIT_MAX_LAG_MINUTES,
      lagMinutes,
      stale,
      latestApproval: latestApproval
        ? {
            id: latestApproval.id,
            requestId: latestApproval.requestId,
            createdAt: latestApproval.createdAt.toISOString(),
          }
        : null,
      latestAudit: latestAudit
        ? {
            id: latestAudit.id,
            requestId: latestAudit.requestId,
            createdAt: latestAudit.createdAt.toISOString(),
          }
        : null,
      lastWriteError: lastWriteError?.value ?? null,
      lastRotationError: rotationError?.value ?? null,
    };

    await db.systemStatus.upsert({
      where: { key: "approval_audit_health" },
      create: { key: "approval_audit_health", value: status },
      update: { value: status },
    });

    if (stale) {
      await sendOpsAlert(
        "approval-audit-lag",
        "Approval audit stream lag exceeds configured threshold",
        {
          lagMinutes,
          maxLagMinutes: APPROVAL_AUDIT_MAX_LAG_MINUTES,
          latestApproval: status.latestApproval,
          latestAudit: status.latestAudit,
        }
      );
    }

    if (rotationError?.value) {
      await sendOpsAlert(
        "approval-audit-rotation-error",
        "Approval audit rotation reported an error",
        { rotationError: rotationError.value }
      );
    }

    const spikeSince = new Date(Date.now() - Math.max(1, APPROVAL_AUDIT_SPIKE_WINDOW_HOURS) * 60 * 60 * 1000);
    const windowEvents = await db.approvalAuditEvent.findMany({
      where: {
        createdAt: { gte: spikeSince },
        decision: { in: ["APPROVED", "EXECUTED"] },
      },
      select: {
        decisionPath: true,
      },
      take: 5000,
    });

    const sampleCount = windowEvents.length;
    const autoCount = windowEvents.filter((event) => event.decisionPath === "POLICY_AUTO").length;
    const autoRatio = sampleCount > 0 ? autoCount / sampleCount : 0;

    const prevSpike = await db.systemStatus.findUnique({ where: { key: "approval_audit_decision_path_spike" } });
    const prevValue = (prevSpike?.value ?? {}) as Record<string, unknown>;
    const prevRatio = typeof prevValue.autoRatio === "number" ? prevValue.autoRatio : 0;
    const ratioDelta = autoRatio - prevRatio;
    const flagged =
      sampleCount >= Math.max(1, APPROVAL_AUDIT_SPIKE_MIN_SAMPLES) &&
      autoRatio >= APPROVAL_AUDIT_AUTO_SPIKE_RATIO &&
      ratioDelta >= APPROVAL_AUDIT_AUTO_SPIKE_DELTA;

    const spikeStatus = {
      checkedAt: new Date().toISOString(),
      windowHours: Math.max(1, APPROVAL_AUDIT_SPIKE_WINDOW_HOURS),
      minSamples: Math.max(1, APPROVAL_AUDIT_SPIKE_MIN_SAMPLES),
      ratioThreshold: APPROVAL_AUDIT_AUTO_SPIKE_RATIO,
      deltaThreshold: APPROVAL_AUDIT_AUTO_SPIKE_DELTA,
      sampleCount,
      autoCount,
      autoRatio,
      prevRatio,
      ratioDelta,
      flagged,
    };

    await db.systemStatus.upsert({
      where: { key: "approval_audit_decision_path_spike" },
      create: { key: "approval_audit_decision_path_spike", value: spikeStatus },
      update: { value: spikeStatus },
    });

    if (flagged) {
      await sendOpsAlert(
        "approval-audit-decision-path-spike",
        "Approval audit auto-approval ratio spiked",
        spikeStatus
      );
    }
  };

  if (gatewayClient) {
    approvalResumeTimer = setInterval(() => {
      dispatchService.resumeApprovedRequests().catch((err) => {
        const errorText = err instanceof Error ? err.message : String(err);
        console.error(`[worker] Failed to resume approved requests: ${errorText}`);
      });
    }, APPROVAL_RESUME_INTERVAL_MS);

    runTrustVerification().catch((err) => {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Initial trust verification failed: ${errorText}`);
      sendOpsAlert("trust-verification-failed", "Initial trust verification failed", {
        error: errorText,
      }).catch((alertErr) => {
        const alertText = alertErr instanceof Error ? alertErr.message : String(alertErr);
        console.error(`[worker] Failed to send trust failure alert: ${alertText}`);
      });
    });

    trustVerifyTimer = setInterval(() => {
      runTrustVerification().catch((err) => {
        const errorText = err instanceof Error ? err.message : String(err);
        console.error(`[worker] Trust verification failed: ${errorText}`);
        sendOpsAlert("trust-verification-failed", "Trust verification failed", {
          error: errorText,
        }).catch((alertErr) => {
          const alertText = alertErr instanceof Error ? alertErr.message : String(alertErr);
          console.error(`[worker] Failed to send trust failure alert: ${alertText}`);
        });
      });
    }, TRUST_VERIFY_INTERVAL_MS);

    runApprovalAuditHealthCheck().catch((err) => {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Initial approval audit health check failed: ${errorText}`);
    });

    approvalAuditHealthTimer = setInterval(() => {
      runApprovalAuditHealthCheck().catch((err) => {
        const errorText = err instanceof Error ? err.message : String(err);
        console.error(`[worker] Approval audit health check failed: ${errorText}`);
      });
    }, APPROVAL_AUDIT_HEALTH_INTERVAL_MS);
  }

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
  const shutdown = createShutdownHandler({
    scheduler,
    heartbeatTimer,
    approvalResumeTimer,
    trustVerifyTimer,
    approvalAuditHealthTimer,
    gatewayClient,
  });

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
