"use client";

import { useCallback, useMemo, useState } from "react";
import { Sparkles, Users } from "lucide-react";
import { useStudio } from "@/lib/store";
import { STATUS_LABELS, formatModelLabel, isVisibleChatMessage } from "@/lib/constants";
import { MAIN_SESSION_KEY } from "@/lib/reducer";
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
  const activeSessionKey = state.activeSessionKey ?? MAIN_SESSION_KEY;
  const visibleTasks = useMemo(
    () => state.tasks.filter((task) => task.sessionKey === activeSessionKey),
    [activeSessionKey, state.tasks],
  );
  const visibleMessages = useMemo(
    () =>
      state.chatMessages.filter(
        (message) => message.sessionKey === activeSessionKey && isVisibleChatMessage(message),
      ),
    [activeSessionKey, state.chatMessages],
  );

  const dockItems: HudDockItem[] = useMemo(
    () => [
      { id: "connection", label: "Connection", icon: "/ui/icons/icon-connection.png", iconActive: "/ui/icons/icon-connection-active.png" },
      { id: "chat", label: "Chat", icon: "/ui/icons/icon-chat.png", iconActive: "/ui/icons/icon-chat-active.png" },
      { id: "tasks", label: "Tasks", icon: "/ui/icons/icon-tasks.png", iconActive: "/ui/icons/icon-tasks-active.png" },
      { id: "workers", label: "Employees", icon: "/ui/icons/icon-workers.png", iconActive: "/ui/icons/icon-workers-active.png" },
    ],
    [],
  );

  const runningCount = visibleTasks.filter(
    (task) =>
      task.status === "running" ||
      task.status === "submitted" ||
      task.status === "queued" ||
      task.status === "returning",
  ).length;
  const activeWorkers = state.seats.filter(
    (seat) => seat.status === "running" || seat.status === "returning",
  ).length;

  const togglePanel = useCallback((id: HudPanelId) => {
    setOpenPanel((current) => (current === id ? null : id));
  }, []);

  return (
    <div className="hud-overlay">
      <div className="hud-status-cluster pixel-panel">
        <div className="hud-status-cluster__row">
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

        <div className="hud-status-cluster__row">
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

      <div className="hud-dock-container">
        {openPanel ? (
          <div className="hud-dock-container__panel">
            {openPanel === "connection" ? <ConnectionPanel /> : null}
            {openPanel === "chat" ? (
              <ChatPanel
                messages={visibleMessages}
                tasks={visibleTasks}
                isConnected={state.connection === "connected"}
                sessions={state.sessions}
                activeSessionKey={state.activeSessionKey}
              />
            ) : null}
            {openPanel === "tasks" ? <TaskPanel tasks={visibleTasks} /> : null}
            {openPanel === "workers" ? (
              <WorkerPanel seats={state.seats} onOpenManager={() => setSeatManagerOpen(true)} />
            ) : null}
          </div>
        ) : null}
        <div className="hud-dock-container__dock">
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
