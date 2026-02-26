import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { GatewayClient } from "../gateway.js";

let wss: WebSocketServer;
let port: number;

function startMockGateway(behavior: (ws: WebSocket, msg: Record<string, unknown>) => void): Promise<void> {
  return new Promise((resolve) => {
    wss = new WebSocketServer({ port: 0 });
    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          behavior(ws, msg);
        } catch {
          // ignore
        }
      });
    });
    wss.on("listening", () => {
      port = (wss.address() as { port: number }).port;
      resolve();
    });
  });
}

function stopMockGateway(): Promise<void> {
  return new Promise((resolve) => {
    if (wss) {
      // Close all client connections
      wss.clients.forEach((client) => client.terminate());
      wss.close(() => resolve());
    } else {
      resolve();
    }
  });
}

describe("GatewayClient", () => {
  afterEach(async () => {
    await stopMockGateway();
  });

  it("connect handshake succeeds", async () => {
    await startMockGateway((ws, msg) => {
      if (msg.type === "connect") {
        ws.send(JSON.stringify({ type: "connect_ack" }));
      }
    });

    const client = new GatewayClient();
    await client.connect(`ws://127.0.0.1:${port}`, "test-token");
    expect(client.isConnected()).toBe(true);
    client.disconnect();
  });

  it("request() resolves with payload on success", async () => {
    await startMockGateway((ws, msg) => {
      if (msg.type === "connect") {
        ws.send(JSON.stringify({ type: "connect_ack" }));
      } else if (msg.type === "req") {
        ws.send(JSON.stringify({ type: "res", id: msg.id, ok: true, payload: { run_id: "run-123" } }));
      }
    });

    const client = new GatewayClient();
    await client.connect(`ws://127.0.0.1:${port}`);

    const result = await client.request("agent", { routingKey: "test" }) as { run_id: string };
    expect(result.run_id).toBe("run-123");
    client.disconnect();
  });

  it("request() rejects on error response", async () => {
    await startMockGateway((ws, msg) => {
      if (msg.type === "connect") {
        ws.send(JSON.stringify({ type: "connect_ack" }));
      } else if (msg.type === "req") {
        ws.send(JSON.stringify({ type: "res", id: msg.id, ok: false, error: "Agent not found" }));
      }
    });

    const client = new GatewayClient();
    await client.connect(`ws://127.0.0.1:${port}`);

    await expect(client.request("agent", {})).rejects.toThrow("Agent not found");
    client.disconnect();
  });

  it("request() times out after 30s if no response", async () => {
    vi.useFakeTimers();

    await startMockGateway((ws, msg) => {
      if (msg.type === "connect") {
        ws.send(JSON.stringify({ type: "connect_ack" }));
      }
      // Never respond to requests
    });

    const client = new GatewayClient();
    await client.connect(`ws://127.0.0.1:${port}`);

    const promise = client.request("agent", {});

    // Advance timers by 30 seconds
    vi.advanceTimersByTime(31_000);

    await expect(promise).rejects.toThrow("timeout");
    client.disconnect();
    vi.useRealTimers();
  });
});
