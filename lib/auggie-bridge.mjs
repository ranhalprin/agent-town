/**
 * Auggie Bridge — ESM version for production server (server.prod.mjs).
 * JS mirror of auggie-bridge.ts for use where TypeScript is not available.
 *
 * Emulates the OpenClaw gateway protocol but delegates to the `auggie` CLI.
 */

import { spawn } from "node:child_process";

const isProd = process.env.NODE_ENV === "production";
const prefix = "[Auggie Bridge]";
const log = {
  debug: isProd ? () => {} : console.debug.bind(console, prefix),
  info: isProd ? () => {} : console.info.bind(console, prefix),
  warn: console.warn.bind(console, prefix),
  error: console.error.bind(console, prefix),
};

let runCounter = 0;

function sendFrame(state, WebSocket, frame) {
  if (state.ws.readyState !== WebSocket.OPEN) return;
  try {
    state.ws.send(JSON.stringify(frame));
  } catch (err) {
    log.error("sendFrame failed:", err.message);
  }
}

function sendEvent(state, WebSocket, event, payload) {
  sendFrame(state, WebSocket, { type: "event", event, payload, seq: state.seq++ });
}

function sendResponse(state, WebSocket, id, ok, payloadOrError) {
  const frame = { type: "res", id, ok };
  if (ok) frame.payload = payloadOrError;
  else frame.error = payloadOrError;
  sendFrame(state, WebSocket, frame);
}

function parseAuggieOutput(raw) {
  const idx = raw.indexOf("{");
  if (idx === -1) return null;
  try {
    return JSON.parse(raw.slice(idx));
  } catch {
    const lines = raw.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("{")) {
        try {
          return JSON.parse(line);
        } catch {
          continue;
        }
      }
    }
    return null;
  }
}

function checkOrigin(req, socket) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        log.warn(`Rejected WS upgrade: origin ${origin} does not match host ${host}`);
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return false;
      }
    } catch {
      log.warn(`Rejected WS upgrade: invalid origin ${origin}`);
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return false;
    }
  }
  return true;
}

function buildPersonalityPrefix(params) {
  const label = params.seatLabel;
  const role = params.seatRole;
  if (!label && !role) return "[You are powered by Auggie. Stay in character when responding.]\n\n";
  const parts = [];
  if (label) parts.push(`Your name is "${label}".`);
  if (role) parts.push(`Your role is ${role}.`);
  parts.push("You are powered by Auggie.");
  parts.push("Stay in character when responding.\n\n");
  return `[${parts.join(" ")}]\n`;
}

function handleChatSend(state, WebSocket, id, params) {
  const sessionKey = params.sessionKey ?? "default";
  const rawMessage = params.message ?? "";
  const message = buildPersonalityPrefix(params) + rawMessage;
  const runId = `auggie_${Date.now()}_${++runCounter}`;

  sendResponse(state, WebSocket, id, true, { runId });
  sendEvent(state, WebSocket, "agent", {
    runId,
    sessionKey,
    stream: "lifecycle",
    data: { phase: "start" },
  });

  const args = ["--print", "--output-format", "json"];
  const existingSessionId = state.sessionMap.get(sessionKey);
  if (existingSessionId) args.push("--resume", existingSessionId);
  args.push(message);

  log.info(`Spawning auggie for run ${runId}:`, ["auggie", ...args].join(" "));

  let child;
  try {
    child = spawn("auggie", args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
  } catch (err) {
    const errMsg = `Failed to spawn auggie: ${err.message}`;
    log.error(errMsg);
    sendEvent(state, WebSocket, "agent", {
      runId,
      sessionKey,
      stream: "lifecycle",
      data: { phase: "error", error: errMsg },
    });
    sendEvent(state, WebSocket, "chat", { runId, sessionKey, state: "error" });
    return;
  }

  state.runningProcesses.set(runId, child);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.on("error", (err) => {
    log.error(`auggie process error for run ${runId}:`, err.message);
    state.runningProcesses.delete(runId);
    sendEvent(state, WebSocket, "agent", {
      runId,
      sessionKey,
      stream: "lifecycle",
      data: { phase: "error", error: err.message },
    });
    sendEvent(state, WebSocket, "chat", { runId, sessionKey, state: "error" });
  });

  child.on("close", (code) => {
    state.runningProcesses.delete(runId);
    if (code === null || code !== 0) {
      const errMsg = stderr.trim() || `auggie exited with code ${code}`;
      log.error(`auggie failed for run ${runId}:`, errMsg);
      sendEvent(state, WebSocket, "agent", {
        runId,
        sessionKey,
        stream: "lifecycle",
        data: { phase: "error", error: errMsg },
      });
      sendEvent(state, WebSocket, "chat", { runId, sessionKey, state: "error" });
      return;
    }
    const parsed = parseAuggieOutput(stdout);
    if (!parsed) {
      log.error(`auggie produced unparseable output for run ${runId}:`, stdout.slice(0, 500));
      sendEvent(state, WebSocket, "agent", {
        runId,
        sessionKey,
        stream: "lifecycle",
        data: { phase: "error", error: "Failed to parse auggie output" },
      });
      sendEvent(state, WebSocket, "chat", { runId, sessionKey, state: "error" });
      return;
    }
    if (typeof parsed.session_id === "string") {
      state.sessionMap.set(sessionKey, parsed.session_id);
      log.debug(`Mapped sessionKey ${sessionKey} → auggie session ${parsed.session_id}`);
    }
    const responseText =
      typeof parsed.response === "string"
        ? parsed.response
        : typeof parsed.result === "string"
          ? parsed.result
          : JSON.stringify(parsed);
    sendEvent(state, WebSocket, "agent", {
      runId,
      sessionKey,
      stream: "lifecycle",
      data: { phase: "end" },
    });
    sendEvent(state, WebSocket, "chat", {
      runId,
      sessionKey,
      state: "final",
      message: { content: [{ type: "text", text: responseText }] },
    });
    log.info(`Run ${runId} completed successfully`);
  });
}

function handleChatAbort(state, WebSocket, id, params) {
  const runId = params.runId;
  const sessionKey = params.sessionKey ?? "default";

  if (runId && state.runningProcesses.has(runId)) {
    const child = state.runningProcesses.get(runId);
    child.kill("SIGTERM");
    state.runningProcesses.delete(runId);
    log.info(`Aborted run ${runId}`);
  }

  sendResponse(state, WebSocket, id, true, {});
  if (runId) {
    sendEvent(state, WebSocket, "chat", { runId, sessionKey, state: "aborted" });
  }
}

async function handleModelsList(state, WebSocket, id) {
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn("auggie", ["model", "list", "--json"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(`auggie model list exited with code ${code}`));
      });
      setTimeout(() => {
        child.kill();
        reject(new Error("timeout"));
      }, 10_000);
    });

    const parsed = parseAuggieOutput(result);
    if (parsed && Array.isArray(parsed.models)) {
      sendResponse(state, WebSocket, id, true, { models: parsed.models });
      return;
    }
    const idx = result.indexOf("[");
    if (idx !== -1) {
      try {
        const arr = JSON.parse(result.slice(idx));
        if (Array.isArray(arr)) {
          sendResponse(state, WebSocket, id, true, { models: arr });
          return;
        }
      } catch {
        /* fall through */
      }
    }
  } catch (err) {
    log.warn("Failed to list auggie models:", err.message);
  }

  sendResponse(state, WebSocket, id, true, {
    models: [{ id: "default", provider: "auggie", contextWindow: 128000 }],
  });
}

function handleMessage(state, WebSocket, raw) {
  let frame;
  try {
    frame = JSON.parse(raw);
  } catch {
    log.warn("Received non-JSON message, ignoring");
    return;
  }

  if (frame.type !== "req") {
    log.debug("Ignoring non-request frame:", frame.type);
    return;
  }

  const { id, method, params } = frame;
  if (!id || !method) {
    log.warn("Request frame missing id or method");
    return;
  }

  log.debug(`Request: ${method} (id=${id})`);

  switch (method) {
    case "connect":
      sendResponse(state, WebSocket, id, true, {
        type: "hello-ok",
        scopes: ["operator.read", "operator.write"],
      });
      break;
    case "chat.send":
      handleChatSend(state, WebSocket, id, params ?? {});
      break;
    case "chat.abort":
      handleChatAbort(state, WebSocket, id, params ?? {});
      break;
    case "sessions.list":
      sendResponse(state, WebSocket, id, true, { sessions: [] });
      break;
    case "sessions.preview":
      sendResponse(state, WebSocket, id, true, { previews: [] });
      break;
    case "models.list":
      void handleModelsList(state, WebSocket, id);
      break;
    default:
      log.warn(`Unknown method: ${method}`);
      sendResponse(state, WebSocket, id, false, {
        code: "unknown_method",
        message: `Unknown method: ${method}`,
      });
      break;
  }
}

function cleanupClient(state) {
  for (const [runId, child] of state.runningProcesses) {
    log.info(`Killing orphaned process for run ${runId}`);
    child.kill("SIGTERM");
  }
  state.runningProcesses.clear();
}

/**
 * Attach the Auggie bridge WebSocket handler to an HTTP server.
 * @param {import("http").Server} server
 * @param {typeof import("ws").WebSocket} WebSocket
 * @param {typeof import("ws").WebSocketServer} WebSocketServer
 * @param {string} [path="/api/gateway"]
 */
export function attachAuggieBridge(server, WebSocket, WebSocketServer, path = "/api/gateway") {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url !== path) return;
    if (!checkOrigin(req, socket)) return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      const state = { ws, seq: 0, runningProcesses: new Map(), sessionMap: new Map() };

      log.info("Client connected");
      sendEvent(state, WebSocket, "connect.challenge", {});

      ws.on("message", (data) => {
        handleMessage(state, WebSocket, data.toString());
      });
      ws.on("close", () => {
        log.info("Client disconnected");
        cleanupClient(state);
      });
      ws.on("error", (err) => {
        log.error("Client WS error:", err.message);
        cleanupClient(state);
      });
    });
  });

  wss.on("error", (err) => {
    log.error("WebSocketServer error:", err.message);
  });
  log.info(`Auggie bridge attached on ${path}`);
}
