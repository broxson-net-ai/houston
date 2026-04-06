type ShutdownDeps = {
  scheduler: { stop: () => Promise<void> };
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  approvalResumeTimer: ReturnType<typeof setInterval> | null;
  trustVerifyTimer: ReturnType<typeof setInterval> | null;
  approvalAuditHealthTimer?: ReturnType<typeof setInterval> | null;
  runTimeoutWatchdogTimer?: ReturnType<typeof setInterval> | null;
  gatewayClient?: { disconnect: () => void };
};

export function createShutdownHandler(
  deps: ShutdownDeps,
  exitFn: (code: number) => never = process.exit
) {
  return async (signal: string): Promise<void> => {
    console.log(`[worker] ${signal} received, shutting down...`);

    try {
      await deps.scheduler.stop();
      console.log("[worker] Scheduler stopped");
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Failed to stop scheduler: ${errorText}`);
    }

    if (deps.heartbeatTimer) {
      clearInterval(deps.heartbeatTimer);
      console.log("[worker] Heartbeat timer stopped");
    }

    if (deps.approvalResumeTimer) {
      clearInterval(deps.approvalResumeTimer);
      console.log("[worker] Approval resume timer stopped");
    }

    if (deps.trustVerifyTimer) {
      clearInterval(deps.trustVerifyTimer);
      console.log("[worker] Trust verification timer stopped");
    }

    if (deps.approvalAuditHealthTimer) {
      clearInterval(deps.approvalAuditHealthTimer);
      console.log("[worker] Approval audit health timer stopped");
    }

    if (deps.runTimeoutWatchdogTimer) {
      clearInterval(deps.runTimeoutWatchdogTimer);
      console.log("[worker] Run timeout watchdog timer stopped");
    }

    if (deps.gatewayClient) {
      try {
        deps.gatewayClient.disconnect();
        console.log("[worker] Gateway disconnected");
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        console.error(`[worker] Failed to disconnect gateway: ${errorText}`);
      }
    }

    console.log("[worker] Shutdown complete, exiting...");
    exitFn(0);
  };
}
