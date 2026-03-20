import { describe, it, expect, vi } from "vitest";
import { createShutdownHandler } from "../shutdown.js";

describe("createShutdownHandler", () => {
  it("stops scheduler, clears timers, disconnects gateway, and exits", async () => {
    const scheduler = { stop: vi.fn().mockResolvedValue(undefined) };
    const gatewayClient = { disconnect: vi.fn() };
    const exitFn = vi.fn() as unknown as (code: number) => never;

    const heartbeatTimer = setInterval(() => {}, 1_000);
    const approvalResumeTimer = setInterval(() => {}, 1_000);
    const trustVerifyTimer = setInterval(() => {}, 1_000);

    const shutdown = createShutdownHandler(
      {
        scheduler,
        heartbeatTimer,
        approvalResumeTimer,
        trustVerifyTimer,
        gatewayClient,
      },
      exitFn
    );

    await shutdown("SIGTERM");

    expect(scheduler.stop).toHaveBeenCalledTimes(1);
    expect(gatewayClient.disconnect).toHaveBeenCalledTimes(1);
    expect(exitFn).toHaveBeenCalledWith(0);

    clearInterval(heartbeatTimer);
    clearInterval(approvalResumeTimer);
    clearInterval(trustVerifyTimer);
  });
});
