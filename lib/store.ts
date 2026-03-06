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
  TaskItem,
  ChatMessage,
  GatewayConfig,
  StudioSnapshot,
} from "@/types/game";
import { GatewayClient, type GatewayFrame } from "./gateway";
import { gameEvents } from "./events";

// ── localStorage helpers ──────────────────────────────────

const LS_CONFIG = "agent-world:gateway-config";
const LS_TASKS = "agent-world:tasks";
const LS_CHAT = "agent-world:chat";
const MAX_CHAT = 500;
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

// ── State / Actions / Reducer ─────────────────────────────

const initialState: StudioSnapshot = {
  connection: "disconnected",
  seats: [],
  tasks: [],
  chatMessages: [],
};

type Action =
  | { type: "SET_CONNECTION"; status: ConnectionStatus }
  | { type: "ADD_TASK"; task: TaskItem }
  | { type: "UPDATE_TASK"; taskId: string; patch: Partial<TaskItem> }
  | { type: "APPEND_CHAT"; message: ChatMessage }
  | { type: "APPEND_DELTA"; runId: string; delta: string }
  | { type: "FINALIZE_ASSISTANT"; runId: string; content: string }
  | { type: "RESTORE"; tasks: TaskItem[]; chatMessages: ChatMessage[] }
  | { type: "NEW_SESSION" };

function reducer(state: StudioSnapshot, action: Action): StudioSnapshot {
  switch (action.type) {
    case "SET_CONNECTION":
      return { ...state, connection: action.status };

    case "ADD_TASK":
      return { ...state, tasks: [action.task, ...state.tasks] };

    case "UPDATE_TASK":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.taskId === action.taskId ? { ...t, ...action.patch } : t
        ),
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

    case "RESTORE":
      return {
        ...state,
        tasks: action.tasks,
        chatMessages: action.chatMessages.filter((m) => !isRedundantConnectionMessage(m)),
      };

    case "NEW_SESSION":
      return { ...state, tasks: [], chatMessages: [] };

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────

interface StudioContextValue {
  state: StudioSnapshot;
  connect: (config?: GatewayConfig) => void;
  disconnect: () => void;
  dispatchTask: (message: string) => void;
  newSession: () => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within StudioProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────

const DEFAULT_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "ws://127.0.0.1:18789/";
const DEFAULT_TOKEN = process.env.NEXT_PUBLIC_GATEWAY_TOKEN ?? "";

const SUBAGENT_KEY_RE = /subagent:/;
let taskCounter = 0;
const seenStarts = new Set<string>();
/** Accumulated assistant text per runId — used for game bubbles */
const bubbleAccum = new Map<string, string>();

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const dispatchRef = useRef<Dispatch<Action>>(dispatch);
  dispatchRef.current = dispatch;

  const clientRef = useRef<GatewayClient | null>(null);
  const configRef = useRef<GatewayConfig>({ url: DEFAULT_URL, token: DEFAULT_TOKEN });

  // ── Wire up a GatewayClient and register all event handlers ──

  const wireClient = useCallback((client: GatewayClient) => {
    client.onStatus((s) => {
      dispatchRef.current({ type: "SET_CONNECTION", status: s });
    });

    client.on("agent", (payload: unknown) => {
      const p = payload as Record<string, unknown>;
      const runId = p.runId as string | undefined;
      if (!runId) return;

      const sessionKey = p.sessionKey as string | undefined;
      const isSubagent = sessionKey ? SUBAGENT_KEY_RE.test(sessionKey) : false;
      const data = p.data as Record<string, unknown> | undefined;
      const stream = p.stream as string | undefined;

      if (stream === "lifecycle") {
        if (data?.phase === "start" && !seenStarts.has(runId)) {
          seenStarts.add(runId);
          if (isSubagent) {
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
          }
        } else if (data?.phase === "end") {
          seenStarts.delete(runId);
          bubbleAccum.delete(runId);
          gameEvents.emit("task-completed", runId);
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
        } else if (data?.phase === "error") {
          seenStarts.delete(runId);
          bubbleAccum.delete(runId);
          gameEvents.emit("task-failed", runId);
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
      } else if (eventState === "error" || eventState === "aborted") {
        dispatchRef.current({
          type: "UPDATE_TASK", taskId: runId, patch: { status: "failed" },
        });
        gameEvents.emit("task-failed", runId);
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
      } else if (!f.ok || status === "error" || status === "timeout") {
        dispatchRef.current({
          type: "UPDATE_TASK", taskId: runId, patch: { status: "failed" },
        });
      }
    });
  }, []);

  // ── Connect implementation ──

  const connectImpl = useCallback(
    (cfg: GatewayConfig) => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }

      configRef.current = cfg;
      lsSet(LS_CONFIG, cfg);

      const client = new GatewayClient(cfg.url, cfg.token);
      clientRef.current = client;
      wireClient(client);

      client.connect().catch((err) => {
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
    [wireClient],
  );

  // ── Bootstrap: restore state + auto-reconnect ──

  useEffect(() => {
    const savedConfig = lsGet<GatewayConfig | null>(LS_CONFIG, null);
    if (savedConfig) configRef.current = savedConfig;

    const tasks = lsGet<TaskItem[]>(LS_TASKS, []);
    const chat = lsGet<ChatMessage[]>(LS_CHAT, []);
    if (tasks.length > 0 || chat.length > 0) {
      dispatch({ type: "RESTORE", tasks, chatMessages: chat });
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
  }, [state.tasks, state.chatMessages]);

  // ── Cleanup ──

  useEffect(() => {
    return () => {
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
    clientRef.current?.disconnect();
    clientRef.current = null;
  }, []);

  const dispatchTask = useCallback((message: string) => {
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

    client
      .request("agent", { message, agentId: "main", idempotencyKey })
      .then((res: GatewayFrame) => {
        const runId = res.payload?.runId as string | undefined;
        dispatchRef.current({
          type: "UPDATE_TASK",
          taskId: idempotencyKey,
          patch: { status: "running", runId: runId ?? undefined },
        });
        gameEvents.emit("task-assigned", runId ?? idempotencyKey, message);
      })
      .catch((err: Error) => {
        console.error("[Gateway] dispatch failed:", err);
        dispatchRef.current({
          type: "UPDATE_TASK",
          taskId: idempotencyKey,
          patch: { status: "failed" },
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
  }, []);

  const newSession = useCallback(() => {
    bubbleAccum.clear();
    seenStarts.clear();
    dispatchRef.current({ type: "NEW_SESSION" });
    lsSet(LS_TASKS, []);
    lsSet(LS_CHAT, []);
  }, []);

  return React.createElement(
    StudioContext.Provider,
    { value: { state, connect, disconnect, dispatchTask, newSession } },
    children,
  );
}
