"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  type Dispatch,
  type ReactNode,
} from "react";
import React from "react";
import type { SeatState, TaskItem, GatewayConfig } from "@/types/game";
import type { StudioSnapshot } from "@/types/game";
import { GatewayClient } from "./gateway";
import type { GatewayFrame } from "./gateway-types";
import type { ModelChoice } from "./gateway-handler";
import { wireGatewayClient, loadSessionPreview } from "./gateway-handler";
import { gameEvents } from "./events";
import { getDefaultGatewayUrl } from "./utils";
import {
  type PersistedSeatConfig,
  loadGatewayConfig,
  saveGatewayConfig,
  loadActiveSessionKey,
  saveActiveSessionKey,
  loadTasks,
  loadChat,
  loadSessions,
  loadSeatConfigs,
  saveTasks,
  saveChat,
  saveSessions,
  saveSeatConfigs,
} from "./persistence";
import {
  type Action,
  reducer,
  initialState,
  chatId,
  findTask,
  generateSessionKey,
  resolveSeatLabelForTask,
  mergeDiscoveredSeats,
  MAIN_SESSION_KEY,
  createEmptySessionMetrics,
} from "./reducer";

// ── Context ────────────────────────────────────────────

interface StudioContextValue {
  state: StudioSnapshot;
  connect: (config?: GatewayConfig) => void;
  disconnect: () => void;
  assignTask: (message: string, seatId?: string) => void;
  updateSeatConfig: (seatId: string, patch: Partial<SeatState>) => void;
  newSession: () => void;
  switchSession: (sessionKey: string) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within StudioProvider");
  return ctx;
}

// ── Provider ───────────────────────────────────────────

const DEFAULT_URL = getDefaultGatewayUrl();
const DEFAULT_TOKEN = process.env.NEXT_PUBLIC_GATEWAY_TOKEN ?? "";

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const dispatchRef = useRef<Dispatch<Action>>(dispatch);
  dispatchRef.current = dispatch;
  const tasksRef = useRef<TaskItem[]>(state.tasks);
  tasksRef.current = state.tasks;
  const seatsRef = useRef<SeatState[]>(state.seats);
  seatsRef.current = state.seats;
  const seatConfigRef = useRef<PersistedSeatConfig[]>([]);

  const clientRef = useRef<GatewayClient | null>(null);
  const configRef = useRef<GatewayConfig>({ url: DEFAULT_URL, token: DEFAULT_TOKEN });
  const activeSessionKeyRef = useRef<string | undefined>(undefined);
  const sessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskCounterRef = useRef(0);

  // Shared refs for gateway handler
  const seenStartsRef = useRef(new Set<string>());
  const bubbleAccumRef = useRef(new Map<string, string>());
  const bubbleThrottleTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const runActorRef = useRef(new Map<string, string>());
  const modelCatalogRef = useRef<ModelChoice[] | null>(null);

  const setActiveSessionKey = useCallback((sessionKey?: string) => {
    activeSessionKeyRef.current = sessionKey;
    dispatchRef.current({ type: "SET_ACTIVE_SESSION", sessionKey });
  }, []);

  // ── Connect implementation ──

  const connectImpl = useCallback((cfg: GatewayConfig) => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    configRef.current = cfg;
    modelCatalogRef.current = null;

    const client = new GatewayClient(cfg.url, cfg.token);
    clientRef.current = client;

    wireGatewayClient(client, {
      dispatch: () => dispatchRef.current,
      tasks: () => tasksRef.current,
      seats: () => seatsRef.current,
      activeSessionKey: () => activeSessionKeyRef.current,
      setActiveSessionKey,
      seenStarts: seenStartsRef.current,
      bubbleAccum: bubbleAccumRef.current,
      bubbleThrottleTimers: bubbleThrottleTimersRef.current,
      runActors: runActorRef.current,
      modelCatalog: modelCatalogRef,
      sessionRefreshTimer: sessionRefreshTimerRef,
      taskCounter: taskCounterRef,
    });

    client
      .connect()
      .then(() => {
        saveGatewayConfig(cfg);
      })
      .catch((err) => {
        console.warn("[Gateway] connect failed:", err.message);
        dispatchRef.current({ type: "SET_CONNECTION", status: "error" });
        dispatchRef.current({
          type: "APPEND_CHAT",
          message: {
            id: chatId(), runId: "", role: "system",
            content: `Connection failed: ${err.message}`,
            timestamp: new Date().toISOString(),
            sessionKey: activeSessionKeyRef.current ?? MAIN_SESSION_KEY,
          },
        });
      });
  }, [setActiveSessionKey]);

  // ── Bootstrap: restore state + auto-connect ──

  useEffect(() => {
    const savedConfig = loadGatewayConfig();
    if (savedConfig) configRef.current = savedConfig;

    const savedActiveKey = loadActiveSessionKey();
    const fallbackSessionKey = savedActiveKey ?? MAIN_SESSION_KEY;
    const tasks = loadTasks(fallbackSessionKey);
    const chat = loadChat(fallbackSessionKey);
    const sessions = loadSessions();
    const seatConfigs = loadSeatConfigs();
    seatConfigRef.current = seatConfigs;
    if (savedActiveKey) {
      activeSessionKeyRef.current = savedActiveKey;
    }
    if (tasks.length > 0 || chat.length > 0 || sessions.length > 0) {
      dispatch({ type: "RESTORE", tasks, chatMessages: chat, sessions });
    }
    if (savedActiveKey) {
      dispatch({ type: "SET_ACTIVE_SESSION", sessionKey: savedActiveKey });
    }

    const unsubSeats = gameEvents.on("seats-discovered", (discovered) => {
      const mergedSeats = mergeDiscoveredSeats(discovered, seatConfigRef.current, seatsRef.current);
      dispatchRef.current({ type: "SYNC_SEATS", seats: mergedSeats });
    });

    if (savedConfig?.url) {
      const t = setTimeout(() => connectImpl(savedConfig), 80);
      return () => {
        clearTimeout(t);
        unsubSeats();
      };
    }
    return unsubSeats;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist tasks + chat + sessions ──

  useEffect(() => {
    saveTasks(state.tasks);
    saveChat(state.chatMessages);
    saveSessions(state.sessions);
  }, [state.tasks, state.chatMessages, state.sessions]);

  useEffect(() => {
    const configs: PersistedSeatConfig[] = state.seats.map((seat) => ({
      seatId: seat.seatId,
      label: seat.label,
      roleTitle: seat.roleTitle,
      assigned: seat.assigned,
      spriteKey: seat.spriteKey,
      spritePath: seat.spritePath,
    }));
    seatConfigRef.current = configs;
    saveSeatConfigs(configs);
    gameEvents.emit("seat-configs-updated", state.seats);
  }, [state.seats]);

  // ── Cleanup ──

  useEffect(() => {
    return () => {
      if (sessionRefreshTimerRef.current) {
        clearTimeout(sessionRefreshTimerRef.current);
      }
      for (const timer of bubbleThrottleTimersRef.current.values()) {
        clearTimeout(timer);
      }
      clientRef.current?.disconnect();
    };
  }, []);

  // ── Task routing via gateway ──

  const sendTaskToGateway = useCallback((taskId: string, message: string, seatId?: string) => {
    const client = clientRef.current;
    if (!client || client.status !== "connected") return;
    const task = findTask(tasksRef.current, taskId);
    const sessionKey = task?.sessionKey ?? activeSessionKeyRef.current ?? MAIN_SESSION_KEY;
    const actorName = task?.actorName ?? resolveSeatLabelForTask(seatsRef.current, seatId);

    dispatchRef.current({ type: "UPDATE_TASK", taskId, patch: { status: "submitted" } });
    if (seatId) {
      dispatchRef.current({
        type: "PATCH_SEAT_RUNTIME",
        seatId,
        patch: {
          status: "running",
          taskSnippet: message.slice(0, 28),
          startedAt: new Date().toISOString(),
        },
      });
    }

    client
      .request("agent", {
        message,
        agentId: "main",
        idempotencyKey: taskId,
        sessionKey,
      })
      .then((res: GatewayFrame) => {
        const runId = (res.payload?.runId as string) ?? undefined;
        const finalRunId = runId ?? taskId;
        if (actorName) {
          runActorRef.current.set(finalRunId, actorName);
          dispatchRef.current({ type: "SET_RUN_ACTOR", runId: finalRunId, actorName });
        }
        dispatchRef.current({
          type: "UPDATE_TASK",
          taskId,
          patch: { status: "running", runId: runId ?? undefined, actorName, seatId },
        });
        dispatchRef.current({ type: "BIND_SEAT_RUN", taskId, runId: finalRunId });
        gameEvents.emit("task-bound", taskId, finalRunId);
      })
      .catch((err: Error) => {
        console.error("[Gateway] assign failed:", err);
        dispatchRef.current({ type: "UPDATE_TASK", taskId, patch: { status: "failed" } });
        dispatchRef.current({ type: "SET_SEAT_STATUS", runId: taskId, status: "failed" });
        gameEvents.emit("task-failed", taskId);
        dispatchRef.current({
          type: "APPEND_CHAT",
          message: {
            id: chatId(), runId: taskId, role: "system",
            content: `Assign failed: ${err.message}`,
            timestamp: new Date().toISOString(),
            sessionKey,
          },
        });
      });
  }, []);

  useEffect(() => {
    return gameEvents.on("task-ready", (taskId, message, seatId) => {
      sendTaskToGateway(taskId, message, seatId);
    });
  }, [sendTaskToGateway]);

  useEffect(() => {
    return gameEvents.on("task-routed", (taskId, seatId, actorName) => {
      dispatchRef.current({ type: "UPDATE_TASK", taskId, patch: { seatId, actorName } });
    });
  }, []);

  useEffect(() => {
    return gameEvents.on("task-staged", (taskId, stage, seatId) => {
      dispatchRef.current({ type: "UPDATE_TASK", taskId, patch: { status: stage, seatId } });
      if (!seatId) return;
      dispatchRef.current({
        type: "PATCH_SEAT_RUNTIME",
        seatId,
        patch: {
          status: stage === "returning" ? "returning" : "running",
          runId: taskId,
          taskSnippet: stage === "returning" ? "Returning to desk..." : "Queued task",
          startedAt: new Date().toISOString(),
        },
      });
    });
  }, []);

  // ── Public API ──

  const connect = useCallback(
    (config?: GatewayConfig) => {
      connectImpl(config ?? configRef.current);
    },
    [connectImpl],
  );

  const disconnect = useCallback(() => {
    if (sessionRefreshTimerRef.current) {
      clearTimeout(sessionRefreshTimerRef.current);
      sessionRefreshTimerRef.current = null;
    }
    clientRef.current?.disconnect();
    clientRef.current = null;
    setActiveSessionKey(undefined);
    dispatchRef.current({ type: "SET_SESSION_METRICS", metrics: createEmptySessionMetrics() });
  }, [setActiveSessionKey]);

  const updateSeatConfig = useCallback((seatId: string, patch: Partial<SeatState>) => {
    dispatchRef.current({ type: "UPDATE_SEAT_CONFIG", seatId, patch });
  }, []);

  const assignTask = useCallback((message: string, seatId?: string) => {
    const client = clientRef.current;
    if (!client || client.status !== "connected") return;

    const taskId = `aw_task_${++taskCounterRef.current}_${Date.now()}`;
    const sessionKey = activeSessionKeyRef.current ?? MAIN_SESSION_KEY;
    const actorName = seatId ? resolveSeatLabelForTask(seatsRef.current, seatId) : undefined;

    dispatchRef.current({
      type: "ADD_TASK",
      task: { taskId, message, status: "submitted", sessionKey, seatId, actorName, createdAt: new Date().toISOString() },
    });
    dispatchRef.current({
      type: "APPEND_CHAT",
      message: { id: chatId(), runId: taskId, role: "user", content: message, timestamp: new Date().toISOString(), sessionKey },
    });
    gameEvents.emit("task-assigned", taskId, message, seatId);
  }, []);

  const finalizeStoppedTask = useCallback((runId: string, seatId?: string) => {
    const task = findTask(tasksRef.current, runId);
    if (!task || task.status === "stopped" || task.status === "completed") return;
    dispatchRef.current({
      type: "UPDATE_TASK", taskId: runId,
      patch: { status: "stopped", completedAt: new Date().toISOString(), result: task.result ?? "Stopped by user" },
    });
    if (seatId) {
      dispatchRef.current({
        type: "PATCH_SEAT_RUNTIME", seatId,
        patch: { status: "empty", runId: undefined, taskSnippet: undefined, startedAt: undefined },
      });
    } else {
      dispatchRef.current({ type: "SET_SEAT_STATUS", runId, status: "empty" });
    }
    dispatchRef.current({
      type: "APPEND_CHAT",
      message: { id: chatId(), runId, role: "system", content: "Task stopped", timestamp: new Date().toISOString(), sessionKey: task.sessionKey },
    });
    gameEvents.emit("task-aborted", runId);
  }, []);

  useEffect(() => {
    return gameEvents.on("stop-task", async (runId, seatId) => {
      const task = findTask(tasksRef.current, runId);
      if (!task) return;
      if (task.status === "queued" || task.status === "returning" || !task.runId) {
        finalizeStoppedTask(runId, seatId);
        return;
      }

      const client = clientRef.current;
      if (!client || client.status !== "connected") {
        finalizeStoppedTask(runId, seatId);
        return;
      }

      try {
        await client.request("agent.abort", { runId: task.runId, sessionKey: task.sessionKey }, 10000);
        finalizeStoppedTask(runId, seatId);
      } catch {
        dispatchRef.current({
          type: "APPEND_CHAT",
          message: {
            id: chatId(), runId, role: "system",
            content: "Stop task failed: gateway rejected the stop request",
            timestamp: new Date().toISOString(),
            sessionKey: task.sessionKey,
          },
        });
      }
    });
  }, [finalizeStoppedTask]);

  const newSession = useCallback(() => {
    const newKey = generateSessionKey();
    const record = {
      key: newKey,
      label: `Session ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      createdAt: new Date().toISOString(),
    };

    bubbleAccumRef.current.clear();
    seenStartsRef.current.clear();
    dispatchRef.current({ type: "NEW_SESSION", session: record });
    activeSessionKeyRef.current = newKey;
    saveActiveSessionKey(newKey);
  }, []);

  const switchSession = useCallback(async (sessionKey: string) => {
    if (sessionKey === activeSessionKeyRef.current) return;

    bubbleAccumRef.current.clear();
    seenStartsRef.current.clear();
    saveActiveSessionKey(sessionKey);

    // Dispatch first to update Redux, then sync ref — single source of truth
    dispatchRef.current({ type: "SWITCH_SESSION", sessionKey });
    activeSessionKeyRef.current = sessionKey;

    const client = clientRef.current;
    let messages: Awaited<ReturnType<typeof loadSessionPreview>> = [];
    try {
      messages = client ? await loadSessionPreview(client, sessionKey) : [];
    } catch (err) {
      console.error("[Store] loadSessionPreview failed:", err);
    }

    // Guard: user may have switched again while we were loading
    if (activeSessionKeyRef.current !== sessionKey) return;
    dispatchRef.current({ type: "HYDRATE_SESSION_CHAT", sessionKey, chatMessages: messages });
  }, []);

  return React.createElement(
    StudioContext.Provider,
    { value: { state, connect, disconnect, assignTask, updateSeatConfig, newSession, switchSession } },
    children,
  );
}
