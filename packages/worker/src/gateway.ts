import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "events";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

type RequestCallback = {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type GatewayEvent = {
  type: string;
  [key: string]: unknown;
};

const REQUEST_TIMEOUT_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

// OpenClaw gateway protocol uses an allowlist for these values.
// (See OpenClaw dist: GATEWAY_CLIENT_IDS / GATEWAY_CLIENT_MODES)
const CLIENT_ID = "gateway-client";
const CLIENT_MODE = "backend";

// Device identity (we reuse the OpenClaw operator device identity on this host).
// This avoids re-inventing pairing/device auth for a local dashboard.
const DEFAULT_DEVICE_IDENTITY_PATH = path.join(
  os.homedir(),
  ".openclaw",
  "identity",
  "device.json"
);

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const spki = crypto.createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function publicKeyRawBase64UrlFromPem(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, "utf8"), key));
}

function normalizeDeviceMetadataForAuth(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase();
}

function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce: string;
  platform?: string;
  deviceFamily?: string;
}): string {
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const platform = normalizeDeviceMetadataForAuth(params.platform);
  const deviceFamily = normalizeDeviceMetadataForAuth(params.deviceFamily);
  return [
    "v3",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily,
  ].join("|");
}

type DeviceIdentity = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

function loadDeviceIdentity(filePath = DEFAULT_DEVICE_IDENTITY_PATH): DeviceIdentity {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (
    parsed?.version !== 1 ||
    typeof parsed.deviceId !== "string" ||
    typeof parsed.publicKeyPem !== "string" ||
    typeof parsed.privateKeyPem !== "string"
  ) {
    throw new Error(`Invalid device identity file: ${filePath}`);
  }
  return {
    deviceId: parsed.deviceId,
    publicKeyPem: parsed.publicKeyPem,
    privateKeyPem: parsed.privateKeyPem,
  };
}

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string = "";
  private token?: string;
  private pending = new Map<string, RequestCallback>();
  private connected = false;
  private reconnectAttempts = 0;
  private shouldReconnect = true;
  private lastHeartbeat?: Date;
  private protocolVersion = 3;

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

      let settled = false;
      const settleOk = () => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimeout);
        resolve();
      };
      const settleErr = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimeout);
        reject(err);
      };

      ws.on("open", () => {
        // Server will send connect.challenge; we wait.
        console.log("[gateway] WebSocket connected, waiting for challenge...");
      });

      ws.on("message", (data: WebSocket.RawData) => {
        let msg: {
          type: string;
          event?: string;
          ok?: boolean;
          id?: string;
          payload?: unknown;
          error?: { message?: string } | string;
          [key: string]: unknown;
        };
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        // Handle connect.challenge
        if (msg.type === "event" && msg.event === "connect.challenge") {
          const nonce = (msg.payload as { nonce?: string } | undefined)?.nonce;
          if (!nonce || !nonce.trim()) {
            settleErr(new Error("connect.challenge missing nonce"));
            ws.close(1008, "connect.challenge missing nonce");
            return;
          }

          const role = "operator";
          const scopes = ["operator.read", "operator.write"]; // minimal
          const signedAtMs = Date.now();
          const platform = process.platform; // "darwin" on linc

          let deviceIdentity: DeviceIdentity;
          try {
            deviceIdentity = loadDeviceIdentity();
          } catch (err) {
            settleErr(err instanceof Error ? err : new Error(String(err)));
            ws.close(1008, "device identity load failed");
            return;
          }

          const deviceFamily = "desktop";

          const payload = buildDeviceAuthPayloadV3({
            deviceId: deviceIdentity.deviceId,
            clientId: CLIENT_ID,
            clientMode: CLIENT_MODE,
            role,
            scopes,
            signedAtMs,
            token: this.token ?? null,
            nonce: nonce.trim(),
            platform,
            deviceFamily,
          });

          const signature = signDevicePayload(deviceIdentity.privateKeyPem, payload);

          const connectRequest = {
            type: "req",
            id: "connect",
            method: "connect",
            params: {
              minProtocol: this.protocolVersion,
              maxProtocol: this.protocolVersion,
              client: {
                id: CLIENT_ID,
                version: "dev",
                platform,
                deviceFamily,
                mode: CLIENT_MODE,
              },
              role,
              scopes,
              auth: {
                token: this.token,
              },
              device: {
                id: deviceIdentity.deviceId,
                publicKey: publicKeyRawBase64UrlFromPem(deviceIdentity.publicKeyPem),
                signature,
                signedAt: signedAtMs,
                nonce: nonce.trim(),
              },
            },
          };

          ws.send(JSON.stringify(connectRequest));
          console.log("[gateway] Sent connect request");
          return;
        }

        // Handle connect response
        if (msg.type === "res" && msg.id === "connect") {
          if (msg.ok) {
            this.connected = true;
            this.reconnectAttempts = 0;
            this.lastHeartbeat = new Date();
            settleOk();
          } else {
            const errMsg =
              typeof msg.error === "string"
                ? msg.error
                : msg.error?.message ?? "connect failed";
            settleErr(new Error(errMsg));
          }
          return;
        }

        this.lastHeartbeat = new Date();

        // Handle responses to pending requests
        if (msg.type === "res" && msg.id) {
          const pending = this.pending.get(msg.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pending.delete(msg.id);
            if (msg.ok) pending.resolve(msg.payload);
            else {
              const errMsg =
                typeof msg.error === "string"
                  ? msg.error
                  : msg.error?.message ?? "Gateway error";
              pending.reject(new Error(errMsg));
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
        if (!this.connected) {
          settleErr(err instanceof Error ? err : new Error(String(err)));
        }
      });

      ws.on("close", (code, reason) => {
        const reasonText = reason?.toString() ?? "";
        if (!this.connected) {
          settleErr(new Error(`Gateway closed before connect (code=${code} reason=${reasonText})`));
        }

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

      // OpenClaw Gateway request frames do NOT accept extra root properties.
      // Idempotency is handled inside method params (e.g. params.idempotencyKey).
      let finalParams: unknown = params;
      if (idempotencyKey && params && typeof params === "object") {
        const p = params as Record<string, unknown>;
        if (p.idempotencyKey == null) finalParams = { ...p, idempotencyKey };
      }

      const msg: Record<string, unknown> = { type: "req", id, method, params: finalParams };

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
