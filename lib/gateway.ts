/**
 * OpenClaw Gateway WebSocket client.
 *
 * Protocol: frame-based RPC over WebSocket.
 *   - req/res for request-response
 *   - event for server-pushed updates
 *   - Handshake: connect.challenge → connect → hello-ok
 */

type Listener = (payload: unknown) => void;

export interface GatewayFrame {
  type: "req" | "res" | "event";
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  ok?: boolean;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string; retryable?: boolean };
  event?: string;
  seq?: number;
}

interface PendingRequest {
  resolve: (res: GatewayFrame) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type GatewayStatus = "disconnected" | "connecting" | "connected" | "error";

let counter = 0;
function nextId(): string {
  return `aw_${++counter}_${Date.now()}`;
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventListeners = new Map<string, Set<Listener>>();
  private statusListeners = new Set<(s: GatewayStatus) => void>();
  private _status: GatewayStatus = "disconnected";
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  get status(): GatewayStatus {
    return this._status;
  }

  private setStatus(s: GatewayStatus) {
    this._status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  onStatus(fn: (s: GatewayStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  on(event: string, fn: Listener): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(fn);
    return () => this.eventListeners.get(event)?.delete(fn);
  }

  connect(): Promise<GatewayFrame> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      this.setStatus("connecting");

      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        // Wait for connect.challenge event from server
      };

      ws.onmessage = (ev: MessageEvent) => {
        let frame: GatewayFrame;
        try {
          frame = JSON.parse(typeof ev.data === "string" ? ev.data : "{}");
        } catch {
          return;
        }
        this.handleFrame(frame, resolve);
      };

      ws.onerror = () => {
        this.setStatus("error");
        reject(new Error("WebSocket connection error"));
      };

      ws.onclose = () => {
        this.setStatus("disconnected");
        // Reject all pending requests
        for (const [id, p] of this.pending) {
          p.reject(new Error("Connection closed"));
          clearTimeout(p.timer);
          this.pending.delete(id);
        }
      };
    });
  }

  private handleFrame(frame: GatewayFrame, onConnected?: (res: GatewayFrame) => void) {
    if (frame.type === "event") {
      // Handle connect.challenge → send connect request
      if (frame.event === "connect.challenge") {
        this.sendConnectHandshake();
        return;
      }

      // Dispatch to event listeners
      const listeners = this.eventListeners.get(frame.event!);
      if (listeners) {
        listeners.forEach((fn) => fn(frame.payload));
      }
      // Also fire wildcard
      const wildcard = this.eventListeners.get("*");
      if (wildcard) {
        wildcard.forEach((fn) => fn(frame));
      }
      return;
    }

    if (frame.type === "res") {
      const pending = this.pending.get(frame.id!);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(frame.id!);

        if (
          frame.ok &&
          frame.payload?.type === "hello-ok"
        ) {
          this.setStatus("connected");
          onConnected?.(frame);
        }

        if (frame.ok) {
          pending.resolve(frame);
        } else {
          pending.reject(
            new Error(frame.error?.message ?? "Request failed")
          );
        }
        return;
      }

      if (frame.ok && frame.payload?.type === "hello-ok") {
        this.setStatus("connected");
        onConnected?.(frame);
        return;
      }

      // Gateway sends a second res frame for long-running requests
      // (first = "accepted", second = final "ok"/"error"). Route it
      // as an internal event so the store can update task status.
      const listeners = this.eventListeners.get("__final_res__");
      if (listeners) {
        listeners.forEach((fn) => fn(frame));
      }
    }
  }

  private sendConnectHandshake() {
    const id = nextId();
    const frame: GatewayFrame = {
      type: "req",
      id,
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "gateway-client",
          displayName: "Agent World",
          version: "1.0.0",
          platform: "web",
          mode: "backend",
          instanceId: `aw-${Date.now()}`,
        },
        auth: { token: this.token },
        role: "operator",
        scopes: ["operator.read", "operator.write", "operator.admin"],
        locale: "en-US",
      },
    };

    // Register as pending so the response routes correctly
    const timer = setTimeout(() => {
      this.pending.delete(id);
      this.setStatus("error");
    }, 15000);

    this.pending.set(id, {
      resolve: () => {},
      reject: () => {},
      timer,
    });

    this.ws?.send(JSON.stringify(frame));
  }

  async request(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs = 30000
  ): Promise<GatewayFrame> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }

    const id = nextId();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      const frame: GatewayFrame = { type: "req", id, method, params };
      this.ws!.send(JSON.stringify(frame));
    });
  }

  onFinalResponse(fn: (frame: GatewayFrame) => void): () => void {
    return this.on("__final_res__", fn as Listener);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }
}
