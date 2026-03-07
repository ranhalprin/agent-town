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
import type {
  ConnectionStatus,
  SeatState,
  TaskItem,
  ChatMessage,
  GatewayConfig,
  SessionMetrics,
  SessionRecord,
  StudioSnapshot,
} from "@/types/game";
import { GatewayClient, type GatewayFrame } from "./gateway";
import { gameEvents } from "./events";
import { getDefaultGatewayUrl } from "./utils";
import { WORKER_SPRITES } from "@/components/game/config/animations";

// ── localStorage helpers ──────────────────────────────────

const LS_CONFIG = "agent-world:gateway-config";
const LS_TASKS = "agent-world:tasks";
const LS_CHAT = "agent-world:chat";
const LS_SESSIONS = "agent-world:sessions";
const LS_ACTIVE_KEY = "agent-world:active-session-key";
const MAX_CHAT = 500;
const MAX_SESSIONS = 20;
const CONNECTED_TO_PREFIX = "Connected to ";

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ── Helpers ───────────────────────────────────────────────

let chatSeq = 0;
function chatId(): string {
  return `chat_${Date.now()}_${++chatSeq}`;
}

function isRedundantConnectionMessage(msg: ChatMessage): boolean {
  return msg.role === "system" && msg.content.startsWith(CONNECTED_TO_PREFIX);
}

function createInitialSeats(): SeatState[] {
  return WORKER_SPRITES.map((worker, index) => ({
    seatId: `seat-${index}`,
    label: worker.label,
    status: "empty",
  }));
}

function createEmptySessionMetrics(): SessionMetrics {
  return {
    fresh: false,
  };
}

let sessionSeq = 0;
function generateSessionKey(): string {
  return `agent:main:${Date.now()}_${++sessionSeq}`;
}

function patchTasks(tasks: TaskItem[], taskId: string, patch: Partial<TaskItem>) {
  return tasks.map((task) =>
    task.taskId === taskId || task.runId === taskId ? { ...task, ...patch } : task
  );
}

function findAssignableSeatIndex(seats: SeatState[]) {
  const available = seats.findIndex((seat) => seat.status !== "running");
  return available >= 0 ? available : -1;
}

function findSeatIndexById(seats: SeatState[], seatId?: string) {
  if (!seatId) return -1;
  return seats.findIndex((seat) => seat.seatId === seatId);
}

// ── State / Actions / Reducer ─────────────────────────────

const initialState: StudioSnapshot = {
  connection: "disconnected",
  seats: createInitialSeats(),
  tasks: [],
  chatMessages: [],
  activeSessionKey: undefined,
  sessionMetrics: createEmptySessionMetrics(),
  sessions: [],
};

type Action =
  | { type: "SET_CONNECTION"; status: ConnectionStatus }
  | { type: "ADD_TASK"; task: TaskItem }
  | { type: "UPDATE_TASK"; taskId: string; patch: Partial<TaskItem> }
  | { type: "APPEND_CHAT"; message: ChatMessage }
  | { type: "APPEND_DELTA"; runId: string; delta: string }
  | { type: "FINALIZE_ASSISTANT"; runId: string; content: string }
  | { type: "SET_ACTIVE_SESSION"; sessionKey?: string }
  | { type: "SET_SESSION_METRICS"; metrics: SessionMetrics }
  | { type: "ASSIGN_SEAT"; runId: string; taskSnippet: string; seatId?: string }
  | { type: "SET_SEAT_STATUS"; runId: string; status: SeatState["status"] }
  | { type: "RESET_SEATS" }
  | { type: "RESTORE"; tasks: TaskItem[]; chatMessages: ChatMessage[]; sessions: SessionRecord[] }
  | { type: "NEW_SESSION"; session: SessionRecord }
  | { type: "SET_SESSIONS"; sessions: SessionRecord[] }
  | { type: "SWITCH_SESSION"; sessionKey: string; tasks: TaskItem[]; chatMessages: ChatMessage[] };

function reducer(state: StudioSnapshot, action: Action): StudioSnapshot {
  switch (action.type) {
    case "SET_CONNECTION":
      return { ...state, connection: action.status };

    case "ADD_TASK":
      return { ...state, tasks: [action.task, ...state.tasks] };

    case "UPDATE_TASK":
      return {
        ...state,
        tasks: patchTasks(state.tasks, action.taskId, action.patch),
      };

    case "APPEND_CHAT":
      if (isRedundantConnectionMessage(action.message)) {
        return state;
      }
      return {
        ...state,
        chatMessages: [...state.chatMessages, action.message].slice(-MAX_CHAT),
      };

    case "APPEND_DELTA": {
      const msgs = [...state.chatMessages];
      let idx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].runId === action.runId && msgs[i].role === "assistant") {
          idx = i;
          break;
        }
      }
      if (idx >= 0) {
        msgs[idx] = {
          ...msgs[idx],
          content: msgs[idx].content + action.delta,
          streaming: true,
        };
      } else {
        msgs.push({
          id: chatId(),
          runId: action.runId,
          role: "assistant",
          content: action.delta,
          timestamp: new Date().toISOString(),
          streaming: true,
        });
      }
      return { ...state, chatMessages: msgs.slice(-MAX_CHAT) };
    }

    case "FINALIZE_ASSISTANT": {
      const all = [...state.chatMessages];
      let fi = -1;
      for (let i = all.length - 1; i >= 0; i--) {
        if (all[i].runId === action.runId && all[i].role === "assistant") {
          fi = i;
          break;
        }
      }
      if (fi >= 0) {
        all[fi] = { ...all[fi], content: action.content, streaming: false };
      } else {
        all.push({
          id: chatId(),
          runId: action.runId,
          role: "assistant",
          content: action.content,
          timestamp: new Date().toISOString(),
          streaming: false,
        });
      }
      return { ...state, chatMessages: all };
    }

    case "SET_ACTIVE_SESSION":
      return { ...state, activeSessionKey: action.sessionKey };

    case "SET_SESSION_METRICS":
      return { ...state, sessionMetrics: action.metrics };

    case "ASSIGN_SEAT": {
      const seatIndex = action.seatId
        ? findSeatIndexById(state.seats, action.seatId)
        : findAssignableSeatIndex(state.seats);
      if (seatIndex < 0) return state;

      const seats = [...state.seats];
      const seat = seats[seatIndex];
      if (action.seatId && seat.status === "running" && seat.runId && seat.runId !== action.runId) {
        return state;
      }
      seats[seatIndex] = {
        ...seat,
        status: "running",
        runId: action.runId,
        taskSnippet: action.taskSnippet,
        startedAt: new Date().toISOString(),
      };
      return { ...state, seats };
    }

    case "SET_SEAT_STATUS": {
      const seats: SeatState[] = state.seats.map((seat) => {
        if (seat.runId !== action.runId) return seat;

        if (action.status === "empty") {
          return {
            ...seat,
            status: "empty",
            runId: undefined,
            taskSnippet: undefined,
            startedAt: undefined,
          };
        }

        return {
          ...seat,
          status: action.status,
        };
      });
      return { ...state, seats };
    }

    case "RESET_SEATS":
      return { ...state, seats: createInitialSeats() };

    case "RESTORE":
      return {
        ...state,
        tasks: action.tasks,
        chatMessages: action.chatMessages.filter((m) => !isRedundantConnectionMessage(m)),
        sessions: action.sessions,
      };

    case "NEW_SESSION": {
      const existingSessions = state.sessions.filter((s) => s.key !== action.session.key);
      return {
        ...state,
        tasks: [],
        chatMessages: [],
        activeSessionKey: action.session.key,
        sessionMetrics: createEmptySessionMetrics(),
        seats: createInitialSeats(),
        sessions: [action.session, ...existingSessions].slice(0, MAX_SESSIONS),
      };
    }

    case "SET_SESSIONS": {
      const incomingKeys = new Set(action.sessions.map((s) => s.key));
      const existingByKey = new Map(state.sessions.map((s) => [s.key, s]));

      const merged = action.sessions.map((incoming) => {
        const existing = existingByKey.get(incoming.key);
        if (existing) return { ...existing, label: existing.label ?? incoming.label };
        return incoming;
      });

      const localOnly = state.sessions.filter((s) => !incomingKeys.has(s.key));
      return { ...state, sessions: [...merged, ...localOnly].slice(0, MAX_SESSIONS) };
    }

    case "SWITCH_SESSION":
      return {
        ...state,
        tasks: action.tasks,
        chatMessages: action.chatMessages.filter((m) => !isRedundantConnectionMessage(m)),
        activeSessionKey: action.sessionKey,
        sessionMetrics: createEmptySessionMetrics(),
        seats: createInitialSeats(),
      };

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────

interface StudioContextValue {
  state: StudioSnapshot;
  connect: (config?: GatewayConfig) => void;
  disconnect: () => void;
  dispatchTask: (message: string, seatId?: string) => void;
  newSession: () => void;
  switchSession: (sessionKey: string) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within StudioProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────

const DEFAULT_URL = getDefaultGatewayUrl();
const DEFAULT_TOKEN = process.env.NEXT_PUBLIC_GATEWAY_TOKEN ?? "";

const SUBAGENT_KEY_RE = /subagent:/;
const MAIN_SESSION_KEY = "agent:main:main";
let taskCounter = 0;
const seenStarts = new Set<string>();
/** Accumulated assistant text per runId — used for game bubbles */
const bubbleAccum = new Map<string, string>();

interface SessionListRow {
  key: string;
  model?: string | null;
  modelProvider?: string | null;
  contextTokens?: number | null;
  totalTokens?: number;
  totalTokensFresh?: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

interface SessionsListPayload {
  sessions?: SessionListRow[];
}

interface SessionPreviewItem {
  role: "user" | "assistant" | "tool" | "system" | "other";
  text: string;
}

interface SessionsPreviewEntry {
  key: string;
  status: "ok" | "empty" | "missing" | "error";
  items: SessionPreviewItem[];
}

interface SessionsPreviewPayload {
  previews?: SessionsPreviewEntry[];
}

interface ModelChoice {
  id: string;
  provider: string;
  contextWindow?: number;
}

interface ModelsListPayload {
  models?: ModelChoice[];
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const dispatchRef = useRef<Dispatch<Action>>(dispatch);
  dispatchRef.current = dispatch;

  const clientRef = useRef<GatewayClient | null>(null);
  const configRef = useRef<GatewayConfig>({ url: DEFAULT_URL, token: DEFAULT_TOKEN });
  const activeSessionKeyRef = useRef<string | undefined>(undefined);
  const sessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelCatalogRef = useRef<ModelChoice[] | null>(null);

  const setActiveSessionKey = useCallback((sessionKey?: string) => {
    activeSessionKeyRef.current = sessionKey;
    dispatchRef.current({ type: "SET_ACTIVE_SESSION", sessionKey });
  }, []);

  const loadModelCatalog = useCallback(async (client: GatewayClient) => {
    if (modelCatalogRef.current) {
      return modelCatalogRef.current;
    }

    const response = await client.request("models.list", {});
    const payload = (response.payload ?? {}) as ModelsListPayload;
    const models = Array.isArray(payload.models) ? payload.models : [];
    modelCatalogRef.current = models;
    return models;
  }, []);

  const refreshSessionMetrics = useCallback(async (client = clientRef.current) => {
    if (!client || client.status !== "connected") return;

    try {
      const response = await client.request("sessions.list", {});
      const payload = (response.payload ?? {}) as SessionsListPayload;
      const gatewaySessions = Array.isArray(payload.sessions) ? payload.sessions : [];

      const nonSubagent = gatewaySessions.filter((s) => !SUBAGENT_KEY_RE.test(s.key));

      const sessionRecords: SessionRecord[] = nonSubagent.map((s, i) => ({
        key: s.key,
        label: `Session ${nonSubagent.length - i}`,
        createdAt: new Date().toISOString(),
      }));
      dispatchRef.current({ type: "SET_SESSIONS", sessions: sessionRecords });

      if (nonSubagent.length === 0) {
        if (!activeSessionKeyRef.current) {
          const defaultKey = generateSessionKey();
          const record: SessionRecord = {
            key: defaultKey,
            label: "Session 1",
            createdAt: new Date().toISOString(),
          };
          activeSessionKeyRef.current = defaultKey;
          dispatchRef.current({ type: "NEW_SESSION", session: record });
        }
        dispatchRef.current({ type: "SET_SESSION_METRICS", metrics: createEmptySessionMetrics() });
        return;
      }

      const preferredKey = activeSessionKeyRef.current;
      const row =
        (preferredKey ? nonSubagent.find((session) => session.key === preferredKey) : undefined) ??
        nonSubagent.find((session) => session.key === MAIN_SESSION_KEY) ??
        nonSubagent[0];

      if (!row) return;

      if (!preferredKey) {
        setActiveSessionKey(row.key);
        dispatchRef.current({
          type: "SET_SESSIONS",
          sessions: sessionRecords.length > 0
            ? sessionRecords
            : [{ key: row.key, label: "Session 1", createdAt: new Date().toISOString() }],
        });
      }

      let maxContextTokens =
        typeof row.contextTokens === "number" && row.contextTokens > 0
          ? row.contextTokens
          : undefined;

      if (!maxContextTokens && row.model) {
        const models = await loadModelCatalog(client);
        const matchedModel = models.find(
          (model) =>
            model.id === row.model &&
            (!row.modelProvider || !model.provider || model.provider === row.modelProvider)
        );
        if (typeof matchedModel?.contextWindow === "number" && matchedModel.contextWindow > 0) {
          maxContextTokens = matchedModel.contextWindow;
        }
      }

      dispatchRef.current({
        type: "SET_SESSION_METRICS",
        metrics: {
          usedTokens: typeof row.totalTokens === "number" ? row.totalTokens : undefined,
          maxContextTokens,
          inputTokens: typeof row.inputTokens === "number" ? row.inputTokens : undefined,
          outputTokens: typeof row.outputTokens === "number" ? row.outputTokens : undefined,
          fresh: typeof row.totalTokens === "number" ? row.totalTokensFresh !== false : false,
          model: row.model ?? undefined,
          provider: row.modelProvider ?? undefined,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("[Gateway] session metrics refresh failed:", error);
    }
  }, [loadModelCatalog, setActiveSessionKey]);

  const scheduleSessionMetricsRefresh = useCallback((delayMs = 250) => {
    if (sessionRefreshTimerRef.current) {
      clearTimeout(sessionRefreshTimerRef.current);
    }

    sessionRefreshTimerRef.current = setTimeout(() => {
      sessionRefreshTimerRef.current = null;
      void refreshSessionMetrics();
    }, delayMs);
  }, [refreshSessionMetrics]);

  // ── Wire up a GatewayClient and register all event handlers ──

  const wireClient = useCallback((client: GatewayClient) => {
    client.onStatus((s) => {
      dispatchRef.current({ type: "SET_CONNECTION", status: s });
      if (s === "connected") {
        scheduleSessionMetricsRefresh(120);
      }
    });

    client.on("agent", (payload: unknown) => {
      const p = payload as Record<string, unknown>;
      const runId = p.runId as string | undefined;
      if (!runId) return;

      const sessionKey = p.sessionKey as string | undefined;
      const isSubagent = sessionKey ? SUBAGENT_KEY_RE.test(sessionKey) : false;
      const data = p.data as Record<string, unknown> | undefined;
      const stream = p.stream as string | undefined;

      if (sessionKey && !isSubagent) {
        setActiveSessionKey(sessionKey);
        scheduleSessionMetricsRefresh();
      }

      if (stream === "lifecycle") {
        if (data?.phase === "start" && !seenStarts.has(runId)) {
          seenStarts.add(runId);
          if (isSubagent) {
            dispatchRef.current({
              type: "ASSIGN_SEAT",
              runId,
              taskSnippet: `[Sub] ${((data.label as string) ?? "sub-task").slice(0, 28)}`,
            });
            const label = (data.label as string) ?? "sub-task";
            gameEvents.emit("subagent-assigned", runId, runId, label);
            dispatchRef.current({
              type: "APPEND_CHAT",
              message: {
                id: chatId(), runId, role: "system",
                content: `Subagent started: ${label}`,
                timestamp: new Date().toISOString(),
              },
            });
          } else {
            scheduleSessionMetricsRefresh();
          }
        } else if (data?.phase === "end") {
          seenStarts.delete(runId);
          bubbleAccum.delete(runId);
          gameEvents.emit("task-completed", runId);
          dispatchRef.current({ type: "SET_SEAT_STATUS", runId, status: "done" });
          dispatchRef.current({
            type: "UPDATE_TASK", taskId: runId,
            patch: { status: "completed", completedAt: new Date().toISOString() },
          });
          dispatchRef.current({
            type: "APPEND_CHAT",
            message: {
              id: chatId(), runId, role: "system",
              content: "Task completed",
              timestamp: new Date().toISOString(),
            },
          });
          scheduleSessionMetricsRefresh(400);
        } else if (data?.phase === "error") {
          seenStarts.delete(runId);
          bubbleAccum.delete(runId);
          gameEvents.emit("task-failed", runId);
          dispatchRef.current({ type: "SET_SEAT_STATUS", runId, status: "failed" });
          dispatchRef.current({
            type: "UPDATE_TASK", taskId: runId, patch: { status: "failed" },
          });
          dispatchRef.current({
            type: "APPEND_CHAT",
            message: {
              id: chatId(), runId, role: "system",
              content: `Task error: ${(data.error as string) ?? "unknown"}`,
              timestamp: new Date().toISOString(),
            },
          });
          scheduleSessionMetricsRefresh(400);
        }
      }

      if (stream === "tool" && data) {
        const toolName = (data.name as string) ?? (data.tool as string);
        if (toolName) {
          gameEvents.emit("task-bubble", runId, `🔧 ${toolName}`, 3000);

          const rawInput = data.input ?? data.arguments;
          const rawOutput = data.output ?? data.content ?? data.result;
          const fmtJson = (v: unknown) =>
            typeof v === "string" ? v : JSON.stringify(v, null, 2);

          dispatchRef.current({
            type: "APPEND_CHAT",
            message: {
              id: chatId(), runId, role: "tool",
              content: toolName,
              toolName,
              toolInput: rawInput ? fmtJson(rawInput) : undefined,
              toolOutput: rawOutput ? fmtJson(rawOutput) : undefined,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      if (stream === "assistant" && data?.delta) {
        const delta = typeof data.delta === "string" ? data.delta : "";
        if (delta.length > 0) {
          const accum = (bubbleAccum.get(runId) ?? "") + delta;
          bubbleAccum.set(runId, accum);
          const display = accum.length > 80 ? "..." + accum.slice(-77) : accum;
          gameEvents.emit("task-bubble", runId, display, 4000);
          dispatchRef.current({ type: "APPEND_DELTA", runId, delta });
        }
      }
    });

    client.on("chat", (payload: unknown) => {
      const p = payload as Record<string, unknown>;
      const runId = p.runId as string | undefined;
      if (!runId) return;
      const sessionKey = p.sessionKey as string | undefined;
      if (sessionKey && !SUBAGENT_KEY_RE.test(sessionKey)) {
        setActiveSessionKey(sessionKey);
      }

      const eventState = p.state as string | undefined;
      if (eventState === "final") {
        const msg = p.message as Record<string, unknown> | undefined;
        const content = msg?.content as Array<Record<string, unknown>> | undefined;
        const text = content?.find((c) => c.type === "text")?.text as string | undefined;
        dispatchRef.current({
          type: "UPDATE_TASK", taskId: runId,
          patch: { status: "completed", completedAt: new Date().toISOString(), result: text },
        });
        if (text) {
          dispatchRef.current({ type: "FINALIZE_ASSISTANT", runId, content: text });
        }
        scheduleSessionMetricsRefresh(400);
      } else if (eventState === "error" || eventState === "aborted") {
        dispatchRef.current({
          type: "UPDATE_TASK", taskId: runId, patch: { status: "failed" },
        });
        dispatchRef.current({ type: "SET_SEAT_STATUS", runId, status: "failed" });
        gameEvents.emit("task-failed", runId);
        scheduleSessionMetricsRefresh(400);
      }
    });

    client.onFinalResponse((frame: unknown) => {
      const f = frame as GatewayFrame;
      const runId = f.payload?.runId as string | undefined;
      if (!runId) return;

      const status = f.payload?.status as string | undefined;
      if (f.ok && (status === "ok" || status === "completed")) {
        dispatchRef.current({
          type: "UPDATE_TASK", taskId: runId,
          patch: { status: "completed", completedAt: new Date().toISOString() },
        });
        scheduleSessionMetricsRefresh(400);
      } else if (!f.ok || status === "error" || status === "timeout") {
        dispatchRef.current({
          type: "UPDATE_TASK", taskId: runId, patch: { status: "failed" },
        });
        dispatchRef.current({ type: "SET_SEAT_STATUS", runId, status: "failed" });
      }
    });
  }, [scheduleSessionMetricsRefresh, setActiveSessionKey]);

  // ── Connect implementation ──

  const connectImpl = useCallback(
    (cfg: GatewayConfig) => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }

      configRef.current = cfg;
      modelCatalogRef.current = null;
      lsSet(LS_CONFIG, cfg);

      const client = new GatewayClient(cfg.url, cfg.token);
      clientRef.current = client;
      wireClient(client);

      client
        .connect()
        .then(() => {
          scheduleSessionMetricsRefresh(100);
        })
        .catch((err) => {
          console.error("[Gateway] connect failed:", err);
          dispatchRef.current({ type: "SET_CONNECTION", status: "error" });
          dispatchRef.current({
            type: "APPEND_CHAT",
            message: {
              id: chatId(), runId: "", role: "system",
              content: `Connection failed: ${err.message}`,
              timestamp: new Date().toISOString(),
            },
          });
        });
    },
    [scheduleSessionMetricsRefresh, wireClient],
  );

  // ── Bootstrap: restore state + auto-reconnect ──

  useEffect(() => {
    const savedConfig = lsGet<GatewayConfig | null>(LS_CONFIG, null);
    if (savedConfig) configRef.current = savedConfig;

    const tasks = lsGet<TaskItem[]>(LS_TASKS, []);
    const chat = lsGet<ChatMessage[]>(LS_CHAT, []);
    const sessions = lsGet<SessionRecord[]>(LS_SESSIONS, []);
    const savedActiveKey = lsGet<string | null>(LS_ACTIVE_KEY, null);
    if (savedActiveKey) {
      activeSessionKeyRef.current = savedActiveKey;
    }
    if (tasks.length > 0 || chat.length > 0 || sessions.length > 0) {
      dispatch({ type: "RESTORE", tasks, chatMessages: chat, sessions });
    }
    if (savedActiveKey) {
      dispatch({ type: "SET_ACTIVE_SESSION", sessionKey: savedActiveKey });
    }

    if (savedConfig?.url) {
      const t = setTimeout(() => connectImpl(savedConfig), 80);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist tasks + chat ──

  useEffect(() => {
    lsSet(LS_TASKS, state.tasks.slice(0, 50));
    lsSet(LS_CHAT, state.chatMessages.slice(-200));
    lsSet(LS_SESSIONS, state.sessions.slice(0, MAX_SESSIONS));
  }, [state.tasks, state.chatMessages, state.sessions]);

  // ── Cleanup ──

  useEffect(() => {
    return () => {
      if (sessionRefreshTimerRef.current) {
        clearTimeout(sessionRefreshTimerRef.current);
      }
      clientRef.current?.disconnect();
    };
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

  const dispatchTask = useCallback((message: string, seatId?: string) => {
    const client = clientRef.current;
    if (!client || client.status !== "connected") return;

    const idempotencyKey = `aw_task_${++taskCounter}_${Date.now()}`;

    dispatchRef.current({
      type: "ADD_TASK",
      task: {
        taskId: idempotencyKey,
        message,
        status: "submitted",
        createdAt: new Date().toISOString(),
      },
    });

    dispatchRef.current({
      type: "APPEND_CHAT",
      message: {
        id: chatId(), runId: idempotencyKey, role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      },
    });

    const sessionKey = activeSessionKeyRef.current;
    client
      .request("agent", {
        message,
        agentId: "main",
        idempotencyKey,
        ...(sessionKey ? { sessionKey } : {}),
      })
      .then((res: GatewayFrame) => {
        const runId = res.payload?.runId as string | undefined;
        dispatchRef.current({
          type: "UPDATE_TASK",
          taskId: idempotencyKey,
          patch: { status: "running", runId: runId ?? undefined },
        });
        dispatchRef.current({
          type: "ASSIGN_SEAT",
          runId: runId ?? idempotencyKey,
          taskSnippet: message.slice(0, 28),
          seatId,
        });
        gameEvents.emit("task-assigned", runId ?? idempotencyKey, message, seatId);
        scheduleSessionMetricsRefresh(300);
      })
      .catch((err: Error) => {
        console.error("[Gateway] dispatch failed:", err);
        dispatchRef.current({
          type: "UPDATE_TASK",
          taskId: idempotencyKey,
          patch: { status: "failed" },
        });
        dispatchRef.current({
          type: "SET_SEAT_STATUS",
          runId: idempotencyKey,
          status: "failed",
        });
        dispatchRef.current({
          type: "APPEND_CHAT",
          message: {
            id: chatId(), runId: idempotencyKey, role: "system",
            content: `Dispatch failed: ${err.message}`,
            timestamp: new Date().toISOString(),
          },
        });
      });
  }, [scheduleSessionMetricsRefresh]);

  const loadSessionPreview = useCallback(async (sessionKey: string): Promise<ChatMessage[]> => {
    const client = clientRef.current;
    if (!client || client.status !== "connected") return [];

    try {
      const res = await client.request("sessions.preview", {
        keys: [sessionKey],
        limit: 50,
        maxChars: 2000,
      });
      const payload = (res.payload ?? {}) as SessionsPreviewPayload;
      const entry = payload.previews?.find((p) => p.key === sessionKey);
      if (!entry || entry.status !== "ok" || entry.items.length === 0) return [];

      const messages: ChatMessage[] = [];
      const items = entry.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const role = item.role === "other" ? "system" as const : item.role;

        if (role === "tool") {
          const resultParts: string[] = [];
          while (i + 1 < items.length && items[i + 1].role === "tool") {
            i++;
            resultParts.push(items[i].text);
          }
          messages.push({
            id: `preview_${i}_${Date.now()}`,
            runId: "",
            role: "tool",
            content: item.text,
            toolName: item.text,
            toolOutput: resultParts.length > 0 ? resultParts.join("\n\n---\n\n") : undefined,
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        messages.push({
          id: `preview_${i}_${Date.now()}`,
          runId: "",
          role,
          content: item.text,
          timestamp: new Date().toISOString(),
        });
      }
      return messages;
    } catch (err) {
      console.error("[Gateway] sessions.preview failed:", err);
      return [];
    }
  }, []);

  const newSession = useCallback(() => {
    const newKey = generateSessionKey();
    const record: SessionRecord = {
      key: newKey,
      label: `Session ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      createdAt: new Date().toISOString(),
    };

    bubbleAccum.clear();
    seenStarts.clear();

    activeSessionKeyRef.current = newKey;
    dispatchRef.current({ type: "NEW_SESSION", session: record });
    lsSet(LS_TASKS, []);
    lsSet(LS_CHAT, []);
    lsSet(LS_ACTIVE_KEY, newKey);

    scheduleSessionMetricsRefresh(300);
  }, [scheduleSessionMetricsRefresh]);

  const switchSession = useCallback(async (sessionKey: string) => {
    if (sessionKey === activeSessionKeyRef.current) return;

    bubbleAccum.clear();
    seenStarts.clear();

    activeSessionKeyRef.current = sessionKey;

    dispatchRef.current({
      type: "SWITCH_SESSION",
      sessionKey,
      tasks: [],
      chatMessages: [],
    });
    lsSet(LS_ACTIVE_KEY, sessionKey);

    const messages = await loadSessionPreview(sessionKey);
    dispatchRef.current({
      type: "SWITCH_SESSION",
      sessionKey,
      tasks: [],
      chatMessages: messages,
    });
    lsSet(LS_TASKS, []);
    lsSet(LS_CHAT, messages);

    scheduleSessionMetricsRefresh(200);
  }, [scheduleSessionMetricsRefresh, loadSessionPreview]);

  return React.createElement(
    StudioContext.Provider,
    { value: { state, connect, disconnect, dispatchTask, newSession, switchSession } },
    children,
  );
}
