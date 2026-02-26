import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "events";

type RequestCallback = {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type GatewayEvent = {
  type: string;
  [key: string]: unknown;
};

const SIDE_EFFECTING_METHODS = new Set(["agent", "run", "cancel"]);
const REQUEST_TIMEOUT_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string = "";
  private token?: string;
  private pending = new Map<string, RequestCallback>();
  private connected = false;
  private reconnectAttempts = 0;
  private shouldReconnect = true;
  private lastHeartbeat?: Date;

  async connect(url: string, token?: string): Promise<void> {
    this.url = url;
    this.token = token;
    this.shouldReconnect = true;
    return this._connect();
  }

  private _connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      const connectTimeout = setTimeout(() => {
        ws.terminate();
        reject(new Error("Gateway connection timeout"));
      }, REQUEST_TIMEOUT_MS);

      ws.on("open", () => {
        // Send connect handshake
        ws.send(JSON.stringify({ type: "connect", token: this.token }));
      });

      ws.on("message", (data: WebSocket.RawData) => {
        let msg: { type: string; ok?: boolean; id?: string; payload?: unknown; error?: string; [key: string]: unknown };
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        // Handle connect ACK
        if (msg.type === "connect_ack" || (msg.type === "res" && msg.id === "connect")) {
          clearTimeout(connectTimeout);
          this.connected = true;
          this.reconnectAttempts = 0;
          this.lastHeartbeat = new Date();
          resolve();
          return;
        }

        this.lastHeartbeat = new Date();

        // Handle responses to pending requests
        if (msg.type === "res" && msg.id) {
          const pending = this.pending.get(msg.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pending.delete(msg.id);
            if (msg.ok) {
              pending.resolve(msg.payload);
            } else {
              pending.reject(new Error(msg.error as string ?? "Gateway error"));
            }
          }
          return;
        }

        // Forward events
        if (msg.type === "event") {
          this.emit("event", msg);
        } else if (msg.type !== "res") {
          this.emit(msg.type, msg);
        }
      });

      ws.on("error", (err) => {
        clearTimeout(connectTimeout);
        if (!this.connected) {
          reject(err);
        }
      });

      ws.on("close", () => {
        this.connected = false;
        // Reject all pending
        for (const [id, cb] of this.pending) {
          clearTimeout(cb.timeout);
          cb.reject(new Error("Gateway disconnected"));
          this.pending.delete(id);
        }
        this.emit("disconnect");

        if (this.shouldReconnect) {
          this._scheduleReconnect();
        }
      });
    });
  }

  private _scheduleReconnect() {
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS
    );
    this.reconnectAttempts++;
    setTimeout(() => {
      if (!this.shouldReconnect) return;
      this._connect().catch((err) => {
        console.error("[gateway] Reconnect failed:", err.message);
      });
    }, delay);
  }

  request(method: string, params: unknown, idempotencyKey?: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.connected) {
        reject(new Error("Gateway not connected"));
        return;
      }

      const id = uuidv4();
      const msg: Record<string, unknown> = { type: "req", id, method, params };

      if (idempotencyKey || SIDE_EFFECTING_METHODS.has(method)) {
        msg.idempotency_key = idempotencyKey ?? uuidv4();
      }

      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify(msg));
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
  }

  getLastHeartbeat(): Date | undefined {
    return this.lastHeartbeat;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
