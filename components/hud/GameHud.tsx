"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { Sparkles, Users } from "lucide-react";
import { useStudio } from "@/lib/store";
import { STATUS_LABELS, formatModelLabel, isVisibleChatMessage } from "@/lib/constants";
import { MAIN_SESSION_KEY } from "@/lib/reducer";
import { useBgm } from "@/lib/useBgm";
import { loadOnboardingDone, loadGatewayConfig, saveOnboardingDone } from "@/lib/persistence";
import ContextMeter from "./ContextMeter";
import HudDock, { type HudDockItem, type HudPanelId } from "./HudDock";
import ConnectionPanel from "./ConnectionPanel";
import ChatPanel from "./ChatPanel";
import TaskPanel from "./TaskPanel";
import WorkerPanel from "./WorkerPanel";
import SeatManagerModal from "./SeatManagerModal";
import MusicControls from "./MusicControls";
import OnboardingOverlay from "./OnboardingOverlay";

export default function GameHud() {
  const { state } = useStudio();
  const bgm = useBgm();
  const [openPanel, setOpenPanel] = useState<HudPanelId | null>(null);
  const [seatManagerOpen, setSeatManagerOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!loadOnboardingDone() && !loadGatewayConfig()) {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    if (showOnboarding && openPanel === "connection") {
      setShowOnboarding(false);
      saveOnboardingDone();
    }
  }, [showOnboarding, openPanel]);

  useEffect(() => {
    if (state.connection === "auth_failed" || state.connection === "unreachable" || state.connection === "rate_limited") {
      setOpenPanel("connection");
    } else if (state.connection === "connected") {
      setOpenPanel((prev) => (prev === "connection" ? null : prev));
    }
  }, [state.connection]);
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
      { id: "music", label: "Music", icon: "/ui/icons/icon-music.png", iconActive: "/ui/icons/icon-music-active.png" },
      { id: "connection", label: "Connection", icon: "/ui/icons/icon-connection.png", iconActive: "/ui/icons/icon-connection-active.png" },
      { id: "chat", label: "Chat", icon: "/ui/icons/icon-chat.png", iconActive: "/ui/icons/icon-chat-active.png" },
      { id: "tasks", label: "Tasks", icon: "/ui/icons/icon-tasks.png", iconActive: "/ui/icons/icon-tasks-active.png" },
      { id: "workers", label: "Employees", icon: "/ui/icons/icon-workers.png", iconActive: "/ui/icons/icon-workers-active.png" },
    ],
    [],
  );

  const totalSeats = state.seats.length;
  const assignedSeats = state.seats.filter((s) => s.assigned).length;
  const workingCount = state.seats.filter(
    (s) => s.assigned && (s.status === "running" || s.status === "returning"),
  ).length;

  const togglePanel = useCallback((id: HudPanelId) => {
    setOpenPanel((current) => (current === id ? null : id));
  }, []);

  const musicIconOverrides: ComponentProps<typeof HudDock>["iconOverrides"] = useMemo(
    () => (bgm.volume <= 0 ? { music: "/ui/icons/icon-music-muted.png" } : undefined),
    [bgm.volume],
  );

  return (
    <>
    <div className="hud-overlay">
      <div className="hud-status-cluster">
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
            <Sparkles size={10} />
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
            <Users size={10} />
            <span>{assignedSeats}/{totalSeats} seat</span>
          </div>
          <div className="hud-pill hud-pill--metric">
            <Sparkles size={10} />
            <span>{workingCount}/{assignedSeats} busy</span>
          </div>
        </div>
      </div>

      <div className="hud-dock-container">
        {openPanel === "music" ? <MusicControls bgm={bgm} /> : null}
        {openPanel && openPanel !== "music" ? (
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
          <HudDock
            items={dockItems}
            openPanel={openPanel}
            onToggle={togglePanel}
            iconOverrides={musicIconOverrides}
          />
        </div>
      </div>
      <SeatManagerModal
        open={seatManagerOpen}
        onClose={() => setSeatManagerOpen(false)}
        seats={state.seats}
      />
    </div>
    {showOnboarding && (
      <OnboardingOverlay onDone={() => setShowOnboarding(false)} />
    )}
    </>
  );
}
