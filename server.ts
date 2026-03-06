/**
 * Custom Next.js server with WebSocket proxy.
 *
 * Proxies ws://localhost:3000/api/gateway → ws://GATEWAY_URL
 * so the browser never needs to connect to the gateway directly
 * (avoids system proxy issues).
 */

import { createServer } from "http";
import next from "next";
import { RawData, WebSocket, WebSocketServer } from "ws";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

const GATEWAY_URL = process.env.GATEWAY_URL ?? "ws://127.0.0.1:18789/";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  // WebSocket proxy on /api/gateway
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    // Only handle our proxy path; let Next.js HMR handle the rest
    if (req.url === "/api/gateway") {
      wss.handleUpgrade(req, socket, head, (clientWs) => {
        proxyWebSocket(clientWs);
      });
    }
    // Don't handle other upgrade requests — Next.js dev server
    // handles its own HMR WebSocket internally
  });

  wss.on("error", (err) => {
    console.error("[WS Proxy] server error:", err.message);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    console.log(`> Gateway proxy: ws://localhost:${port}/api/gateway → ${GATEWAY_URL}`);
  });
});

function proxyWebSocket(clientWs: WebSocket) {
  // Connect to the real gateway
  const upstream = new WebSocket(GATEWAY_URL);
  const bufferedMessages: Array<{ data: RawData; isBinary: boolean }> = [];

  upstream.on("open", () => {
    for (const message of bufferedMessages) {
      upstream.send(message.data, { binary: message.isBinary });
    }
    bufferedMessages.length = 0;
  });

  upstream.on("message", (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  upstream.on("close", (code, reason) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason);
    }
  });

  upstream.on("error", (err) => {
    console.error("[WS Proxy] upstream error:", err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, "Gateway connection error");
    }
  });

  // Client → upstream
  clientWs.on("message", (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
      return;
    }

    if (upstream.readyState === WebSocket.CONNECTING) {
      bufferedMessages.push({ data, isBinary });
    }
  });

  clientWs.on("close", () => {
    bufferedMessages.length = 0;
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.close();
    }
  });

  clientWs.on("error", (err) => {
    console.error("[WS Proxy] client error:", err.message);
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.close();
    }
  });
}
