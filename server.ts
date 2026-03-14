/**
 * Custom Next.js dev server with WebSocket proxy.
 *
 * Proxies ws://localhost:3000/api/gateway → ws://GATEWAY_URL
 * so the browser never needs to connect to the gateway directly.
 */

import { createServer } from "http";
import next from "next";
import { createLogger } from "./lib/logger";
import { attachWsProxy } from "./lib/ws-proxy";

const log = createLogger("Server");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);
const GATEWAY_URL = process.env.GATEWAY_URL ?? "ws://127.0.0.1:18789/";

const app = next({ dev });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => {
      handle(req, res);
    });

    attachWsProxy(server, GATEWAY_URL);

    server.listen(port, () => {
      log.info(`Ready on http://localhost:${port}`);
      log.info(`Gateway proxy: ws://localhost:${port}/api/gateway → ${GATEWAY_URL}`);
    });
  })
  .catch((err) => {
    log.error("Failed to prepare Next.js:", err);
    process.exit(1);
  });
