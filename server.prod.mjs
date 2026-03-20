/**
 * Production server for Agent Town (npx / standalone).
 *
 * Reads the Next.js config from the standalone build output and creates
 * an HTTP server with Next.js request handler + WebSocket proxy.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { attachWsProxy } from "./lib/ws-proxy.mjs";
import {
  attachAuggieBridge,
  dispatchToWorker,
  validateDispatchSecret,
  setWorkerRoster,
} from "./lib/auggie-bridge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV === "production";
const prefix = "[Server]";
const log = {
  info: isProd ? () => {} : console.info.bind(console, prefix),
  error: console.error.bind(console, prefix),
};

// Load standalone config before importing next
const requiredServerFiles = JSON.parse(
  readFileSync(join(__dirname, ".next", "required-server-files.json"), "utf-8"),
);
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(requiredServerFiles.config);

const { default: next } = await import("next");
const { WebSocket, WebSocketServer } = await import("ws");

const port = parseInt(process.env.PORT ?? "3000", 10);
const GATEWAY_URL = process.env.GATEWAY_URL ?? "ws://127.0.0.1:18789/";
const AGENT_PROVIDER = process.env.AGENT_PROVIDER ?? "openclaw";

process.chdir(__dirname);
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

// ── Internal dispatch endpoint for MCP tool → auggie bridge ──

function handleDispatch(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  const remoteIp = req.socket.remoteAddress;
  if (remoteIp !== "127.0.0.1" && remoteIp !== "::1" && remoteIp !== "::ffff:127.0.0.1") {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }
  const secret = req.headers["x-dispatch-secret"];
  if (!secret || !validateDispatchSecret(secret)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid dispatch secret" }));
    return;
  }
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    try {
      const { seatId, task } = JSON.parse(body);
      if (!seatId || !task) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "seatId and task are required" }));
        return;
      }
      dispatchToWorker(seatId, task)
        .then((result) => {
          res.writeHead(result.error ? 500 : 200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((err) => {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
  });
}

function handleSeatSync(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    try {
      const { seats } = JSON.parse(body);
      if (Array.isArray(seats)) {
        setWorkerRoster(
          seats
            .filter((s) => s.assigned)
            .map((s) => ({ seatId: s.seatId, label: s.label, roleTitle: s.roleTitle })),
        );
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end();
    }
  });
}

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => {
      if (AGENT_PROVIDER === "auggie") {
        if (req.url === "/api/internal/dispatch") {
          handleDispatch(req, res);
          return;
        }
        if (req.url === "/api/internal/seat-sync") {
          handleSeatSync(req, res);
          return;
        }
      }
      handle(req, res);
    });

    if (AGENT_PROVIDER === "auggie") {
      attachAuggieBridge(server, WebSocket, WebSocketServer);
    } else {
      attachWsProxy(server, WebSocket, WebSocketServer, GATEWAY_URL);
    }

    server.listen(port, () => {
      log.info("");
      log.info("  \x1b[36m\x1b[1mAgent Town\x1b[0m is running!");
      log.info("");
      log.info(`  > Local:   \x1b[4mhttp://localhost:${port}\x1b[0m`);
      if (AGENT_PROVIDER === "auggie") {
        log.info("  > Provider: Auggie (bridging via auggie CLI)");
      } else {
        log.info(`  > Gateway: ${GATEWAY_URL}`);
      }
      log.info("");
    });
  })
  .catch((err) => {
    log.error("Failed to start Agent Town:", err);
    process.exit(1);
  });
