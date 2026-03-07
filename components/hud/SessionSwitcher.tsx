"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { useStudio } from "@/lib/store";
import { formatRelativeTime } from "@/lib/constants";
import type { SessionRecord } from "@/types/game";

export default function SessionSwitcher({
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
