"use client";

import { useCallback, useMemo, useState } from "react";
import { Sparkles, Users } from "lucide-react";
import { useStudio } from "@/lib/store";
import { STATUS_LABELS, formatModelLabel, isVisibleChatMessage } from "@/lib/constants";
import ContextMeter from "./ContextMeter";
import HudDock, { type HudDockItem, type HudPanelId } from "./HudDock";
import ConnectionPanel from "./ConnectionPanel";
import ChatPanel from "./ChatPanel";
import TaskPanel from "./TaskPanel";
import WorkerPanel from "./WorkerPanel";
import SeatManagerModal from "./SeatManagerModal";

export default function GameHud() {
  const { state } = useStudio();
  const [openPanel, setOpenPanel] = useState<HudPanelId | null>(null);
  const [seatManagerOpen, setSeatManagerOpen] = useState(false);
  const visibleMessages = useMemo(
    () => state.chatMessages.filter(isVisibleChatMessage),
    [state.chatMessages]
  );

  const dockItems: HudDockItem[] = useMemo(
    () => [
      { id: "connection", label: "Connection", icon: "/ui/icons/icon-connection.png", iconActive: "/ui/icons/icon-connection-active.png" },
      { id: "chat", label: "Chat", icon: "/ui/icons/icon-chat.png", iconActive: "/ui/icons/icon-chat-active.png" },
      { id: "tasks", label: "Tasks", icon: "/ui/icons/icon-tasks.png", iconActive: "/ui/icons/icon-tasks-active.png" },
      { id: "workers", label: "Employees", icon: "/ui/icons/icon-workers.png", iconActive: "/ui/icons/icon-workers-active.png" },
    ],
    []
  );

  const runningCount = state.tasks.filter(
    (task) =>
      task.status === "running" ||
      task.status === "submitted" ||
      task.status === "queued" ||
      task.status === "returning"
  ).length;
  const activeWorkers = state.seats.filter(
    (seat) => seat.status === "running" || seat.status === "returning"
  ).length;

  const togglePanel = useCallback((id: HudPanelId) => {
    setOpenPanel((current) => (current === id ? null : id));
  }, []);

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
                tasks={state.tasks}
                isConnected={state.connection === "connected"}
                sessions={state.sessions}
                activeSessionKey={state.activeSessionKey}
              />
            ) : null}
            {openPanel === "tasks" ? <TaskPanel tasks={state.tasks} /> : null}
            {openPanel === "workers" ? (
              <WorkerPanel seats={state.seats} onOpenManager={() => setSeatManagerOpen(true)} />
            ) : null}
          </div>
        ) : null}
        <div style={{ pointerEvents: "auto" }}>
          <HudDock items={dockItems} openPanel={openPanel} onToggle={togglePanel} />
        </div>
      </div>
      <SeatManagerModal
        open={seatManagerOpen}
        onClose={() => setSeatManagerOpen(false)}
        seats={state.seats}
      />
    </div>
  );
}
