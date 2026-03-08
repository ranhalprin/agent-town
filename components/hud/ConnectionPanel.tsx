"use client";

import { useState } from "react";
import { useStudio } from "@/lib/store";
import { LS_CONFIG, STATUS_LABELS } from "@/lib/constants";
import { parseGatewayAddress } from "@/lib/utils";
import HudFlyout from "./HudFlyout";

const DEFAULT_GATEWAY = "ws://127.0.0.1:18789";
const DEFAULT_TOKEN = process.env.NEXT_PUBLIC_GATEWAY_TOKEN ?? "";

export default function ConnectionPanel() {
  const { state, connect, disconnect } = useStudio();
  const [config] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw) as { url?: string; token?: string };
        return {
          url: parsed.url || DEFAULT_GATEWAY,
          token: parsed.token || DEFAULT_TOKEN,
        };
      }
    } catch {}

    return { url: DEFAULT_GATEWAY, token: DEFAULT_TOKEN };
  });
  const [url, setUrl] = useState(config.url);
  const [token, setToken] = useState(config.token);
  const isConnected = state.connection === "connected";
  const isConnecting = state.connection === "connecting";

  const [error, setError] = useState("");

  const handleConnect = () => {
    setError("");
    const parsed = parseGatewayAddress(url);
    if (!parsed) {
      setError("Invalid URL. Use ws://host:port or host:port.");
      return;
    }
    connect({ url: parsed, token: token.trim() });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      handleConnect();
    }
  };

  return (
    <HudFlyout title="Connection" subtitle={`${STATUS_LABELS[state.connection]} gateway link`}>
      <div className="hud-panel__stack">
        <label className="hud-panel__label">Gateway URL</label>
        <input
          className="pixel-input hud-panel__input"
          value={url}
          onChange={(event) => { setUrl(event.target.value); setError(""); }}
          onKeyDown={handleKeyDown}
          placeholder="ws://127.0.0.1:18789"
          disabled={isConnected || isConnecting}
        />
        <label className="hud-panel__label">Token</label>
        <input
          className="pixel-input hud-panel__input"
          type="password"
          value={token}
          onChange={(event) => { setToken(event.target.value); setError(""); }}
          onKeyDown={handleKeyDown}
          placeholder="optional"
          disabled={isConnected || isConnecting}
        />
        {error && (
          <p style={{ color: "var(--pixel-red)", fontSize: "8px" }}>{error}</p>
        )}
        {!isConnected && !isConnecting ? (
          <button
            type="button"
            className="pixel-button pixel-button--primary"
            onClick={handleConnect}
            disabled={!url.trim()}
          >
            Connect
          </button>
        ) : null}
        {isConnected ? (
          <button type="button" className="pixel-button" onClick={disconnect}>
            Disconnect
          </button>
        ) : null}
        {isConnecting ? (
          <button type="button" className="pixel-button" onClick={disconnect}>
            Cancel
          </button>
        ) : null}
      </div>
    </HudFlyout>
  );
}
