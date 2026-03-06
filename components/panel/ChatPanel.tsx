"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useStudio } from "@/lib/store";
import type { ChatMessage } from "@/types/game";

/* ── Bubbles ────────────────────────────────────────────── */

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
      <div
        style={{
          maxWidth: "88%",
          padding: "8px 10px",
          background: "var(--pixel-accent)",
          border: "2px solid #c7374e",
          color: "#fff",
          fontSize: "8px",
          lineHeight: "1.7",
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

function AiBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "10px" }}>
      <div style={{ maxWidth: "88%" }}>
        <div
          style={{
            fontSize: "7px",
            color: "var(--pixel-green)",
            marginBottom: "3px",
            fontWeight: "bold",
          }}
        >
          AI
        </div>
        <div
          style={{
            padding: "8px 10px",
            background: "#0d1b2a",
            border: "2px solid var(--pixel-border)",
            fontSize: "8px",
            lineHeight: "1.7",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
          }}
        >
          {msg.content}
          {msg.streaming && <span className="pixel-cursor">▌</span>}
        </div>
      </div>
    </div>
  );
}

function ToolBubble({ msg }: { msg: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(msg.toolInput || msg.toolOutput);

  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "8px" }}>
      <div style={{ maxWidth: "88%" }}>
        <div
          style={{
            padding: "5px 8px",
            background: "rgba(96,165,250,0.08)",
            border: "2px solid rgba(96,165,250,0.25)",
            fontSize: "8px",
            color: "#60a5fa",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              cursor: hasDetails ? "pointer" : "default",
            }}
            onClick={() => hasDetails && setExpanded((v) => !v)}
          >
            <span>🔧</span>
            <span style={{ fontWeight: "bold" }}>{msg.toolName ?? msg.content}</span>
            {hasDetails && (
              <span style={{ fontSize: "10px", marginLeft: "auto", color: "var(--pixel-muted)" }}>
                {expanded ? "▲" : "▼"}
              </span>
            )}
          </div>

          {expanded && msg.toolInput && (
            <pre
              style={{
                marginTop: "6px",
                padding: "4px 6px",
                background: "rgba(0,0,0,0.3)",
                fontSize: "7px",
                color: "var(--pixel-text)",
                overflow: "auto",
                maxHeight: "120px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                lineHeight: "1.5",
              }}
            >
              {msg.toolInput}
            </pre>
          )}

          {expanded && msg.toolOutput && (
            <pre
              style={{
                marginTop: "4px",
                padding: "4px 6px",
                background: "rgba(0,0,0,0.3)",
                fontSize: "7px",
                color: "var(--pixel-green)",
                overflow: "auto",
                maxHeight: "160px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                lineHeight: "1.5",
              }}
            >
              {msg.toolOutput}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function SystemMsg({ msg }: { msg: ChatMessage }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "6px 0",
        marginBottom: "6px",
      }}
    >
      <span
        style={{
          fontSize: "7px",
          color: "var(--pixel-muted)",
          padding: "2px 12px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {msg.content}
      </span>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  switch (msg.role) {
    case "user":
      return <UserBubble msg={msg} />;
    case "assistant":
      return <AiBubble msg={msg} />;
    case "tool":
      return <ToolBubble msg={msg} />;
    case "system":
      return <SystemMsg msg={msg} />;
    default:
      return null;
  }
}

/* ── Chat panel ─────────────────────────────────────────── */

export default function ChatPanel() {
  const { state, dispatchTask, newSession } = useStudio();
  const { chatMessages, connection } = state;
  const isConnected = connection === "connected";
  const visibleMessages = chatMessages.filter(
    (m) => !(m.role === "system" && m.content.startsWith("Connected to "))
  );

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [visibleMessages, scrollToBottom]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !isConnected) return;
    dispatchTask(trimmed);
    setInput("");
    setTimeout(scrollToBottom, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="pixel-panel"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        opacity: 0.92,
        pointerEvents: "auto",
      }}
    >
      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 10px 6px",
        }}
      >
        {visibleMessages.length === 0 ? (
          <div
            style={{
              fontSize: "8px",
              color: "var(--pixel-muted)",
              textAlign: "center",
              marginTop: "40%",
              lineHeight: "2.2",
            }}
          >
            {isConnected
              ? "Ready. Send a message or press E at the boss desk."
              : "Connect to Gateway to start."}
          </div>
        ) : (
          visibleMessages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
      </div>

      {/* Input */}
      <div
        style={{
          borderTop: "2px solid var(--pixel-border)",
          padding: "8px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: "6px", alignItems: "stretch", minHeight: "46px" }}>
          {visibleMessages.length > 0 && (
            <button
              className="pixel-icon-btn pixel-chat-icon-btn"
              onClick={newSession}
              title="New session"
            >
              +
            </button>
          )}
          <textarea
            ref={inputRef}
            className="pixel-input pixel-chat-input"
            style={{
              flex: 1,
            }}
            placeholder={isConnected ? "Send a task..." : "Not connected"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isConnected}
          />
          <button
            className="pixel-icon-btn pixel-chat-icon-btn pixel-icon-btn--primary"
            onClick={handleSend}
            disabled={!isConnected || !input.trim()}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
