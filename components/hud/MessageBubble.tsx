"use client";

import type { ChatMessage } from "@/types/game";
import ToolBubble from "./ToolBubble";

export default function MessageBubble({ msg, actorName }: { msg: ChatMessage; actorName?: string }) {
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
      <div className="hud-chat__role">{msg.role === "user" ? "You" : msg.actorName ?? actorName ?? "Assistant"}</div>
      <div className="hud-chat__content">
        {msg.content}
        {msg.streaming ? <span className="pixel-cursor">▌</span> : null}
      </div>
    </div>
  );
}
