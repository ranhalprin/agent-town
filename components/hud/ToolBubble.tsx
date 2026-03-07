"use client";

import { useState } from "react";
import type { ChatMessage } from "@/types/game";

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

export default function ToolBubble({ msg }: { msg: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const { summary, detail } = parseToolParts(msg);

  return (
    <div className="hud-chat__tool">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <div className="hud-chat__tool-name">{summary}</div>
        {detail && (
          <button
            type="button"
            className="hud-chat__tool-toggle"
            onClick={() => setExpanded((v) => !v)}
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
