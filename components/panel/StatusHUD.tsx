"use client";

import { useState } from "react";
import { useStudio } from "@/lib/store";
import type { ConnectionStatus } from "@/types/game";
import { getDefaultGatewayUrl } from "@/lib/utils";

const LS_CONFIG = "agent-world:gateway-config";
const DEFAULT_URL = getDefaultGatewayUrl();
const DEFAULT_TOKEN = process.env.NEXT_PUBLIC_GATEWAY_TOKEN ?? "";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  disconnected: "Offline",
  connecting: "Connecting...",
  connected: "Online",
  error: "Error",
};

export default function StatusHUD() {
  const { state, connect, disconnect } = useStudio();
  const { connection, tasks } = state;

  const [showConfig, setShowConfig] = useState(false);
  const [storedConfig] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_CONFIG);
      if (raw) {
        const cfg = JSON.parse(raw) as { url?: string; token?: string };
        return {
          url: cfg.url || DEFAULT_URL,
          token: cfg.token || DEFAULT_TOKEN,
        };
      }
    } catch {}

    return { url: DEFAULT_URL, token: DEFAULT_TOKEN };
  });
  const [url, setUrl] = useState(storedConfig.url);
  const [token, setToken] = useState(storedConfig.token);

  const dotClass =
    connection === "connected"
      ? "pixel-dot--green"
      : connection === "connecting"
        ? "pixel-dot--yellow"
        : "pixel-dot--red";

  const isConnected = connection === "connected";
  const isConnecting = connection === "connecting";
  const runningCount = tasks.filter(
    (t) => t.status === "running" || t.status === "submitted",
  ).length;

  const handleConnect = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    connect({ url: trimmedUrl, token: token.trim() });
  };

  const stopPropagation = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      handleConnect();
    }
  };

  return (
    <div
      className="pixel-panel"
      style={{
        padding: "10px 14px",
        opacity: 0.92,
        pointerEvents: "auto",
        flexShrink: 0,
      }}
    >
      {/* Status row */}
      <div className="flex items-center gap-2">
        <span className={`pixel-dot ${dotClass}`} />
        <span style={{ fontSize: "8px" }}>{STATUS_LABELS[connection]}</span>
        {runningCount > 0 && (
          <span style={{ fontSize: "7px", color: "var(--pixel-yellow)" }}>
            ({runningCount} task{runningCount > 1 ? "s" : ""})
          </span>
        )}
        <button
          className="pixel-icon-btn"
          style={{ marginLeft: "auto" }}
          onClick={() => setShowConfig((v) => !v)}
          title="Settings"
        >
          {showConfig ? "▲" : "⚙"}
        </button>
      </div>

      {/* Expandable config */}
      {showConfig && (
        <div
          style={{
            marginTop: "10px",
            borderTop: "2px solid var(--pixel-border)",
            paddingTop: "10px",
          }}
        >
          <label
            style={{
              fontSize: "8px",
              color: "var(--pixel-muted)",
              textTransform: "uppercase",
              display: "block",
              marginBottom: "4px",
            }}
          >
            Gateway URL
          </label>
          <input
            className="pixel-input"
            style={{ minHeight: "unset", height: "36px", marginBottom: "8px" }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={stopPropagation}
            placeholder={DEFAULT_URL}
            disabled={isConnected || isConnecting}
          />

          <label
            style={{
              fontSize: "8px",
              color: "var(--pixel-muted)",
              textTransform: "uppercase",
              display: "block",
              marginBottom: "4px",
            }}
          >
            Token
          </label>
          <input
            className="pixel-input"
            type="password"
            style={{ minHeight: "unset", height: "36px", marginBottom: "10px" }}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={stopPropagation}
            placeholder="(optional)"
            disabled={isConnected || isConnecting}
          />

          {!isConnected && !isConnecting && (
            <button
              className="pixel-button pixel-button--primary w-full"
              onClick={handleConnect}
              disabled={!url.trim()}
            >
              Connect
            </button>
          )}
          {isConnected && (
            <button className="pixel-button w-full" onClick={disconnect}>
              Disconnect
            </button>
          )}
          {isConnecting && (
            <button className="pixel-button w-full" disabled>
              Connecting...
            </button>
          )}
        </div>
      )}

      {/* Quick connect/disconnect when config hidden */}
      {!showConfig && (
        <div style={{ marginTop: "6px" }}>
          {!isConnected && !isConnecting && (
            <button
              className="pixel-button pixel-button--primary w-full"
              onClick={handleConnect}
              disabled={!url.trim()}
            >
              Connect
            </button>
          )}
          {isConnected && (
            <button className="pixel-button w-full" onClick={disconnect}>
              Disconnect
            </button>
          )}
          {isConnecting && (
            <button className="pixel-button w-full" disabled>
              Connecting...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
