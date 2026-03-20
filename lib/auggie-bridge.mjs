/**
 * Auggie Bridge — ESM version for production server (server.prod.mjs).
 * JS mirror of auggie-bridge.ts for use where TypeScript is not available.
 *
 * Emulates the OpenClaw gateway protocol but delegates to the `auggie` CLI.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const isProd = process.env.NODE_ENV === "production";
const prefix = "[Auggie Bridge]";
const log = {
  debug: isProd ? () => {} : console.debug.bind(console, prefix),
  info: isProd ? () => {} : console.info.bind(console, prefix),
  warn: console.warn.bind(console, prefix),
  error: console.error.bind(console, prefix),
};

/** Maximum bytes to buffer from a single auggie process stdout/stderr. */
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB
/** How long (ms) to let an auggie chat process run before killing it. */
const PROCESS_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

let runCounter = 0;
let activeClientState = null;
let activeWsClass = null;
let workerRoster = [];
const dispatchSecret = randomBytes(32).toString("hex");
let mcpConfigPath = null;

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

// ── Auggie text output filter ──────────────────────────
const SKIP_LINE_RE =
  /^(Applying --max-turns|Request ID:|This error originated|Error: EACCES|    at )/;
const ROBOT_EMOJI = "🤖";
const TOOL_CALL_MARKER = "🔧";
const TOOL_RESULT_MARKER = "📋";

function createOutputFilter() {
  return { mode: "idle", lineBuf: "", skipBlanks: false };
}

function filterChunk(fs, chunk) {
  fs.lineBuf += chunk;
  let out = "";
  let nlIdx;
  while ((nlIdx = fs.lineBuf.indexOf("\n")) !== -1) {
    const line = fs.lineBuf.slice(0, nlIdx);
    fs.lineBuf = fs.lineBuf.slice(nlIdx + 1);
    const trimmed = line.trim();
    if (SKIP_LINE_RE.test(trimmed)) continue;
    if (trimmed === ROBOT_EMOJI) {
      fs.mode = "response";
      fs.skipBlanks = true;
      continue;
    }
    if (trimmed.startsWith(TOOL_CALL_MARKER) || trimmed.startsWith(TOOL_RESULT_MARKER)) {
      fs.mode = "skip";
      continue;
    }
    if (trimmed.startsWith(">") && (trimmed.startsWith("> Thinking") || trimmed.startsWith("> ")))
      continue;
    if (fs.mode === "skip") continue;
    if (fs.mode === "response") {
      if (fs.skipBlanks) {
        if (trimmed === "") continue;
        fs.skipBlanks = false;
      }
      out += line + "\n";
    }
  }
  return out;
}

function filterFlush(fs) {
  if (fs.lineBuf.length === 0) return "";
  const trimmed = fs.lineBuf.trim();
  fs.lineBuf = "";
  if (fs.mode !== "response") return "";
  if (SKIP_LINE_RE.test(trimmed)) return "";
  if (trimmed === ROBOT_EMOJI) return "";
  if (trimmed.startsWith(TOOL_CALL_MARKER) || trimmed.startsWith(TOOL_RESULT_MARKER)) return "";
  if (trimmed.startsWith(">")) return "";
  if (trimmed === "") return "";
  return trimmed;
}

async function extractSessionId() {
  return new Promise((resolve) => {
    try {
      const child = spawn("auggie", ["session", "list", "--json"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk.toString();
      });
      child.on("error", () => resolve(null));
      child.on("close", (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }
        try {
          const parsed = JSON.parse(out.trim());
          const sessions = Array.isArray(parsed) ? parsed : parsed?.sessions;
          if (Array.isArray(sessions) && sessions.length > 0) {
            const latest = sessions[sessions.length - 1];
            const sid = latest?.id ?? latest?.session_id;
            resolve(typeof sid === "string" ? sid : null);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
      setTimeout(() => {
        child.kill();
        resolve(null);
      }, 5000);
    } catch {
      resolve(null);
    }
  });
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

function getMcpServerPath() {
  return join(process.cwd(), "lib", "mcp", "agent-town-mcp.mjs");
}

function writeMcpConfig() {
  if (workerRoster.length <= 1) return null;
  try {
    const port = process.env.PORT ?? "3000";
    const config = {
      mcpServers: {
        "agent-town": {
          command: "node",
          args: [getMcpServerPath()],
          env: {
            AGENT_TOWN_PORT: port,
            AGENT_TOWN_WORKERS: JSON.stringify(workerRoster),
            AGENT_TOWN_DISPATCH_SECRET: dispatchSecret,
          },
        },
      },
    };
    const dir = join(tmpdir(), "agent-town-mcp");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `mcp-config-${process.pid}.json`);
    writeFileSync(filePath, JSON.stringify(config), "utf-8");
    mcpConfigPath = filePath;
    return filePath;
  } catch (err) {
    log.warn("Failed to write MCP config:", err.message);
    return null;
  }
}

function buildWorkerRosterContext(currentSeatLabel) {
  if (workerRoster.length <= 1) return "";
  const others = workerRoster.filter((w) => w.label !== currentSeatLabel);
  if (others.length === 0) return "";
  const lines = others.map(
    (w) => `  • seatId="${w.seatId}" — ${w.label} (${w.roleTitle ?? "Worker"})`,
  );
  return (
    "\n\nYou have team members available. Use the dispatch_to_worker tool to delegate tasks:\n" +
    lines.join("\n") +
    "\n"
  );
}

function buildPersonalityPrefix(params) {
  const label = params.seatLabel;
  const role = params.seatRole;
  if (!label && !role) return "[You are powered by Auggie. Stay in character when responding.]\n\n";
  const parts = [];
  if (label) parts.push(`Your name is "${label}".`);
  if (role) parts.push(`Your role is ${role}.`);
  parts.push("Stay in character when responding.");
  const rosterCtx = buildWorkerRosterContext(label);
  return `[${parts.join(" ")}${rosterCtx}]\n\n`;
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

  const args = ["--print"];
  const cfgPath = writeMcpConfig();
  if (cfgPath) args.push("--mcp-config", cfgPath);
  const existingSessionId = state.sessionMap.get(sessionKey);
  if (existingSessionId) args.push("--resume", existingSessionId);
  args.push(message);

  log.info(`Spawning auggie for run ${runId}:`, ["auggie", ...args].join(" "));

  const port = process.env.PORT ?? "3000";
  let child;
  try {
    child = spawn("auggie", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        AGENT_TOWN_PORT: port,
        AGENT_TOWN_WORKERS: JSON.stringify(workerRoster),
        AGENT_TOWN_DISPATCH_SECRET: dispatchSecret,
      },
    });
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
  const filter = createOutputFilter();
  let allResponseText = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    const filtered = filterChunk(filter, chunk.toString());
    if (filtered.length > 0) {
      allResponseText += filtered;
      sendEvent(state, WebSocket, "agent", {
        runId,
        sessionKey,
        stream: "assistant",
        data: { delta: filtered },
      });
    }
  });
  child.stderr.on("data", (chunk) => {
    if (stderr.length < MAX_OUTPUT_BYTES) {
      stderr += chunk.toString();
      if (stderr.length > MAX_OUTPUT_BYTES) stderr = stderr.slice(0, MAX_OUTPUT_BYTES);
    }
  });

  const timeout = setTimeout(() => {
    if (state.runningProcesses.has(runId)) {
      log.warn(`auggie process timed out after ${PROCESS_TIMEOUT_MS}ms for run ${runId}, killing`);
      child.kill("SIGTERM");
    }
  }, PROCESS_TIMEOUT_MS);

  child.on("error", (err) => {
    clearTimeout(timeout);
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
    clearTimeout(timeout);
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
    const remaining = filterFlush(filter);
    if (remaining.length > 0) {
      allResponseText += remaining;
      sendEvent(state, WebSocket, "agent", {
        runId,
        sessionKey,
        stream: "assistant",
        data: { delta: remaining },
      });
    }
    const responseText = allResponseText.trim();
    extractSessionId()
      .then((sid) => {
        if (sid) {
          state.sessionMap.set(sessionKey, sid);
          log.debug(`Mapped sessionKey ${sessionKey} → auggie session ${sid}`);
        }
      })
      .catch(() => {});
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
  if (activeClientState === state) activeClientState = null;
  for (const [runId, child] of state.runningProcesses) {
    log.info(`Killing orphaned process for run ${runId}`);
    child.kill("SIGTERM");
  }
  state.runningProcesses.clear();
}

export function dispatchToWorker(seatId, task) {
  return new Promise((resolve) => {
    const state = activeClientState;
    const WS = activeWsClass;
    const seat = workerRoster.find((w) => w.seatId === seatId);
    if (!state || !WS || state.ws.readyState !== WS.OPEN) {
      resolve({ result: "", error: "No active WebSocket client" });
      return;
    }
    if (!seat) {
      resolve({ result: "", error: `Unknown seatId: ${seatId}` });
      return;
    }
    const runId = `auggie_sub_${Date.now()}_${++runCounter}`;
    const sessionKey = `subagent:dispatch:${seatId}:${runId}`;
    const prefix = buildPersonalityPrefix({ seatLabel: seat.label, seatRole: seat.roleTitle });
    const message = prefix + task;

    sendEvent(state, WS, "agent", {
      runId,
      sessionKey,
      stream: "lifecycle",
      data: { phase: "start", label: `${seat.label}: ${task.slice(0, 40)}`, seatId },
    });

    const args = ["--print"];
    const seatSessionKey = `dispatch:${seatId}`;
    const existingSessionId = state.sessionMap.get(seatSessionKey);
    if (existingSessionId) args.push("--resume", existingSessionId);
    args.push(message);

    let child;
    try {
      child = spawn("auggie", args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
    } catch (err) {
      sendEvent(state, WS, "agent", {
        runId,
        sessionKey,
        stream: "lifecycle",
        data: { phase: "error", error: err.message },
      });
      resolve({ result: "", error: err.message });
      return;
    }

    const dispatchFilter = createOutputFilter();
    let allDispatchText = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const filtered = filterChunk(dispatchFilter, chunk.toString());
      if (filtered.length > 0) {
        allDispatchText += filtered;
        sendEvent(state, WS, "agent", {
          runId,
          sessionKey,
          stream: "assistant",
          data: { delta: filtered },
        });
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      sendEvent(state, WS, "agent", {
        runId,
        sessionKey,
        stream: "lifecycle",
        data: { phase: "error", error: err.message },
      });
      resolve({ result: "", error: err.message });
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const errMsg = stderr.trim() || `auggie exited with code ${code}`;
        sendEvent(state, WS, "agent", {
          runId,
          sessionKey,
          stream: "lifecycle",
          data: { phase: "error", error: errMsg },
        });
        resolve({ result: "", error: errMsg });
        return;
      }
      const remaining = filterFlush(dispatchFilter);
      if (remaining.length > 0) allDispatchText += remaining;
      const responseText = allDispatchText.trim();
      sendEvent(state, WS, "agent", {
        runId,
        sessionKey,
        stream: "lifecycle",
        data: { phase: "end" },
      });
      sendEvent(state, WS, "chat", {
        runId,
        sessionKey,
        state: "final",
        message: { content: [{ type: "text", text: responseText }] },
      });
      resolve({ result: responseText });
    });
  });
}

export function validateDispatchSecret(secret) {
  return secret === dispatchSecret;
}

export function setWorkerRoster(seats) {
  workerRoster = seats;
  mcpConfigPath = null;
}

/**
 * Attach the Auggie bridge WebSocket handler to an HTTP server.
 * @param {import("http").Server} server
 * @param {typeof import("ws").WebSocket} WebSocket
 * @param {typeof import("ws").WebSocketServer} WebSocketServer
 * @param {string} [path="/api/gateway"]
 */
export function attachAuggieBridge(server, WebSocket, WebSocketServer, path = "/api/gateway") {
  activeWsClass = WebSocket;
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url !== path) return;
    if (!checkOrigin(req, socket)) return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      const state = { ws, seq: 0, runningProcesses: new Map(), sessionMap: new Map() };
      activeClientState = state;

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

  process.on("exit", () => {
    if (mcpConfigPath)
      try {
        unlinkSync(mcpConfigPath);
      } catch {
        /* ignore */
      }
  });

  log.info(`Auggie bridge attached on ${path}`);
}
