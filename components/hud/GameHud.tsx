"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SendHorizontal,
  Sparkles,
  Users,
  Plus,
  ChevronDown,
} from "lucide-react";
import { useStudio } from "@/lib/store";
import type { ChatMessage, ConnectionStatus, SeatState, SessionRecord, TaskItem } from "@/types/game";
import { getDefaultGatewayUrl } from "@/lib/utils";
import ContextMeter from "./ContextMeter";
import HudDock, { type HudDockItem, type HudPanelId } from "./HudDock";
import HudFlyout from "./HudFlyout";

const LS_CONFIG = "agent-world:gateway-config";
const DEFAULT_URL = getDefaultGatewayUrl();
const DEFAULT_TOKEN = process.env.NEXT_PUBLIC_GATEWAY_TOKEN ?? "";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  disconnected: "Offline",
  connecting: "Connecting",
  connected: "Online",
  error: "Error",
};

function formatModelLabel(model?: string) {
  if (!model) return "No model yet";
  if (model.length <= 22) return model;
  const pieces = model.split(/[/:]/).filter(Boolean);
  const tail = pieces[pieces.length - 1];
  return tail && tail.length <= 22 ? tail : `${model.slice(0, 19)}...`;
}

function formatRelativeTime(iso?: string) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function parseToolParts(msg: ChatMessage): { summary: string; detail: string | null } {
  if (msg.toolName) {
    let summary = msg.toolName;
    if (msg.toolInput) {
      try {
        const parsed = JSON.parse(msg.toolInput);
        const hint =
          parsed.command ?? parsed.path ?? parsed.filename ?? parsed.pattern ?? parsed.query ?? parsed.url;
        if (typeof hint === "string") {
          const short = hint.length > 60 ? hint.slice(0, 57) + "..." : hint;
          summary = `${msg.toolName}  ${short}`;
        }
      } catch {}
    }
    return { summary, detail: msg.toolOutput ?? null };
  }

  const text = msg.content ?? "";
  const firstLine = text.split("\n")[0].trim();
  const rest = text.slice(firstLine.length).trim();
  if (rest.length > 0) {
    return { summary: firstLine || "tool", detail: rest };
  }
  return { summary: firstLine || "tool", detail: null };
}

function ToolBubble({ msg }: { msg: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const { summary, detail } = parseToolParts(msg);

  return (
    <div className="hud-chat__tool">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <div className="hud-chat__tool-name">{summary}</div>
        {detail && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: "var(--pixel-muted)",
              cursor: "pointer",
              fontFamily: "var(--pixel-font)",
              fontSize: 7,
              padding: "0 2px",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {expanded ? "hide" : "show"}
          </button>
        )}
      </div>
      {expanded && detail && (
        <div className="hud-chat__tool-output">{detail}</div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "system") {
    return <div className="hud-chat__system">{msg.content}</div>;
  }

  if (msg.role === "tool") {
    return <ToolBubble msg={msg} />;
  }

  return (
    <div
      className={`hud-chat__bubble ${
        msg.role === "user" ? "hud-chat__bubble--user" : "hud-chat__bubble--assistant"
      }`}
    >
      <div className="hud-chat__role">{msg.role === "user" ? "You" : "AI"}</div>
      <div className="hud-chat__content">
        {msg.content}
        {msg.streaming ? <span className="pixel-cursor">▌</span> : null}
      </div>
    </div>
  );
}

function ConnectionPanel() {
  const { state, connect, disconnect } = useStudio();
  const [config] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw) as { url?: string; token?: string };
        return {
          url: parsed.url || DEFAULT_URL,
          token: parsed.token || DEFAULT_TOKEN,
        };
      }
    } catch {}

    return { url: DEFAULT_URL, token: DEFAULT_TOKEN };
  });
  const [url, setUrl] = useState(config.url);
  const [token, setToken] = useState(config.token);
  const isConnected = state.connection === "connected";
  const isConnecting = state.connection === "connecting";

  const handleConnect = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    connect({ url: trimmedUrl, token: token.trim() });
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
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={DEFAULT_URL}
          disabled={isConnected || isConnecting}
        />
        <label className="hud-panel__label">Token</label>
        <input
          className="pixel-input hud-panel__input"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="optional"
          disabled={isConnected || isConnecting}
        />
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
          <button type="button" className="pixel-button" disabled>
            Connecting...
          </button>
        ) : null}
      </div>
    </HudFlyout>
  );
}

function SessionSwitcher({
  sessions,
  activeKey,
}: {
  sessions: SessionRecord[];
  activeKey?: string;
}) {
  const { newSession, switchSession } = useStudio();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeLabel =
    sessions.find((s) => s.key === activeKey)?.label ?? activeKey?.split(":").pop() ?? "Default";

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", gap: 4, alignItems: "center" }}>
      <button
        type="button"
        className="pixel-button"
        style={{
          fontSize: 7,
          padding: "3px 8px",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 4,
          maxWidth: 140,
        }}
        onClick={() => setOpen((prev) => !prev)}
        title="Switch session"
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{activeLabel}</span>
        <ChevronDown size={10} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      <button
        type="button"
        className="pixel-button pixel-button--primary"
        style={{ fontSize: 7, padding: "3px 6px", whiteSpace: "nowrap" }}
        onClick={() => { newSession(); setOpen(false); }}
        title="New session"
      >
        <Plus size={10} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            right: 0,
            minWidth: 180,
            maxWidth: 240,
            maxHeight: 200,
            overflowY: "auto",
            background: "var(--pixel-bg)",
            border: "2px solid var(--pixel-border)",
            zIndex: 50,
            fontFamily: "var(--pixel-font)",
            fontSize: 8,
          }}
        >
          {sessions.length === 0 ? (
            <div style={{ padding: "8px 10px", color: "var(--pixel-muted)" }}>
              No sessions yet
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.key === activeKey;
              return (
                <button
                  key={session.key}
                  type="button"
                  onClick={() => { switchSession(session.key); setOpen(false); }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "6px 8px",
                    border: "none",
                    borderBottom: "1px solid var(--pixel-border)",
                    background: isActive ? "rgba(74, 222, 128, 0.15)" : "transparent",
                    color: isActive ? "#4ade80" : "var(--pixel-text)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                  }}
                >
                  <div style={{ fontWeight: isActive ? "bold" : "normal" }}>
                    {session.label ?? session.key.split(":").pop()}
                  </div>
                  <div style={{ fontSize: 7, color: "var(--pixel-muted)", marginTop: 2 }}>
                    {formatRelativeTime(session.createdAt)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function ChatPanel({
  messages,
  isConnected,
  sessions,
  activeSessionKey,
}: {
  messages: ChatMessage[];
  isConnected: boolean;
  sessions: SessionRecord[];
  activeSessionKey?: string;
}) {
  const { dispatchTask } = useStudio();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !isConnected) return;
    dispatchTask(trimmed);
    setInput("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <HudFlyout
      title="Chat"
      subtitle={isConnected ? "Send messages and view execution" : "Connect to start"}
      headerAction={
        <SessionSwitcher sessions={sessions} activeKey={activeSessionKey} />
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div ref={scrollRef} className="hud-chat">
          {messages.length === 0 ? (
            <div className="hud-empty">No conversation yet. Type a message to begin.</div>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} msg={message} />)
          )}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            className="pixel-input"
            style={{ flex: 1, minHeight: 40, height: 40, resize: "none", padding: "8px 10px" }}
            placeholder={isConnected ? "Type a message..." : "Connect first..."}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isConnected}
          />
          <button
            type="button"
            className="pixel-icon-btn pixel-icon-btn--primary"
            style={{ width: 40, height: 40, minWidth: 40, minHeight: 40 }}
            onClick={handleSend}
            disabled={!isConnected || !input.trim()}
            title="Send"
          >
            <SendHorizontal size={16} />
          </button>
        </div>
      </div>
    </HudFlyout>
  );
}

function TaskPanel({ tasks }: { tasks: TaskItem[] }) {
  const runningTasks = tasks.filter((task) => task.status === "running" || task.status === "submitted");

  return (
    <HudFlyout title="Tasks" subtitle={`${runningTasks.length} active / ${tasks.length} total`}>
      <div className="hud-list">
        {tasks.length === 0 ? (
          <div className="hud-empty">No tasks yet.</div>
        ) : (
          tasks.slice(0, 10).map((task) => (
            <div key={task.taskId} className="hud-list__item">
              <div className="hud-list__top">
                <span className={`hud-status hud-status--${task.status}`}>{task.status}</span>
                <span>{formatRelativeTime(task.completedAt ?? task.createdAt)}</span>
              </div>
              <div className="hud-list__title">{task.message}</div>
            </div>
          ))
        )}
      </div>
    </HudFlyout>
  );
}

function WorkerPanel({ seats }: { seats: SeatState[] }) {
  const active = seats.filter((seat) => seat.status === "running").length;

  return (
    <HudFlyout title="Workers" subtitle={`${active}/${seats.length} currently busy`}>
      <div className="hud-workers">
        {seats.map((seat) => (
          <div key={seat.seatId} className="hud-workers__item">
            <div className="hud-workers__top">
              <span className={`hud-status hud-status--${seat.status}`}>{seat.status}</span>
              <span>{seat.label}</span>
            </div>
            <div className="hud-workers__task">{seat.taskSnippet ?? "Waiting at desk"}</div>
          </div>
        ))}
      </div>
    </HudFlyout>
  );
}

export default function GameHud() {
  const { state } = useStudio();
  const [openPanel, setOpenPanel] = useState<HudPanelId | null>(null);
  const visibleMessages = useMemo(
    () =>
      state.chatMessages.filter(
        (message) =>
          !(message.role === "system" && message.content.startsWith("Connected to "))
      ),
    [state.chatMessages]
  );

  const dockItems: HudDockItem[] = useMemo(
    () => [
      { id: "connection", label: "Connection", icon: "/ui/icons/icon-connection.png", iconActive: "/ui/icons/icon-connection-active.png" },
      { id: "chat", label: "Chat", icon: "/ui/icons/icon-chat.png", iconActive: "/ui/icons/icon-chat-active.png" },
      { id: "tasks", label: "Tasks", icon: "/ui/icons/icon-tasks.png", iconActive: "/ui/icons/icon-tasks-active.png" },
      { id: "workers", label: "Workers", icon: "/ui/icons/icon-workers.png", iconActive: "/ui/icons/icon-workers-active.png" },
    ],
    []
  );

  const runningCount = state.tasks.filter(
    (task) => task.status === "running" || task.status === "submitted"
  ).length;
  const activeWorkers = state.seats.filter((seat) => seat.status === "running").length;

  const togglePanel = (id: HudPanelId) => {
    setOpenPanel((current) => (current === id ? null : id));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      {/* Status cluster — top-right corner */}
      <div
        className="pixel-panel"
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          width: 280,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "8px 10px",
          pointerEvents: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="hud-pill hud-pill--connection">
            <span
              className={`pixel-dot pixel-dot--${
                state.connection === "connected"
                  ? "green"
                  : state.connection === "connecting"
                    ? "yellow"
                    : "red"
              }`}
            />
            <span>{STATUS_LABELS[state.connection]}</span>
          </div>
          <div className="hud-pill hud-pill--model" style={{ flex: "1 1 auto", overflow: "hidden" }}>
            <Sparkles size={12} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {formatModelLabel(state.sessionMetrics.model)}
            </span>
          </div>
        </div>

        <ContextMeter
          usedTokens={state.sessionMetrics.usedTokens}
          maxTokens={state.sessionMetrics.maxContextTokens}
          fresh={state.sessionMetrics.fresh}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="hud-pill hud-pill--metric">
            <Sparkles size={12} />
            <span>{runningCount} running</span>
          </div>
          <div className="hud-pill hud-pill--metric">
            <Users size={12} />
            <span>
              {activeWorkers}/{state.seats.length} busy
            </span>
          </div>
        </div>
      </div>

      {/* Dock (horizontal, bottom-right) + flyout (pops upward) */}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {openPanel ? (
          <div style={{ pointerEvents: "auto" }}>
            {openPanel === "connection" ? <ConnectionPanel /> : null}
            {openPanel === "chat" ? (
              <ChatPanel
                messages={visibleMessages}
                isConnected={state.connection === "connected"}
                sessions={state.sessions}
                activeSessionKey={state.activeSessionKey}
              />
            ) : null}
            {openPanel === "tasks" ? <TaskPanel tasks={state.tasks} /> : null}
            {openPanel === "workers" ? <WorkerPanel seats={state.seats} /> : null}
          </div>
        ) : null}
        <div style={{ pointerEvents: "auto" }}>
          <HudDock items={dockItems} openPanel={openPanel} onToggle={togglePanel} />
        </div>
      </div>
    </div>
  );
}
