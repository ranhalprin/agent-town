// --- Studio domain types ---

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type SeatFacing = "right" | "up" | "left" | "down";

export type SeatStatus = "empty" | "returning" | "running" | "done" | "failed";

export interface SeatState {
  seatId: string;
  label: string;
  roleTitle?: string;
  assigned?: boolean;
  spriteKey?: string;
  spritePath?: string;
  spawnX?: number;
  spawnY?: number;
  spawnFacing?: SeatFacing;
  status: SeatStatus;
  taskSnippet?: string;
  runId?: string;
  startedAt?: string;
}

export type TaskStatus =
  | "submitted"
  | "queued"
  | "returning"
  | "running"
  | "stopped"
  | "completed"
  | "failed";

export interface TaskItem {
  taskId: string;
  message: string;
  status: TaskStatus;
  runId?: string;
  seatId?: string;
  sessionKey: string;
  actorName?: string;
  result?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ChatMessageBase {
  id: string;
  runId: string;
  timestamp: string;
  sessionKey: string;
  actorName?: string;
}

interface TextChatMessage extends ChatMessageBase {
  role: "user" | "assistant" | "system";
  content: string;
  /** true while assistant message is still receiving streaming deltas */
  streaming?: boolean;
}

export interface ToolChatMessage extends ChatMessageBase {
  role: "tool";
  content: string;
  toolName: string;
  toolInput?: string;
  toolOutput?: string;
}

export type ChatMessage = TextChatMessage | ToolChatMessage;

export interface GatewayConfig {
  url: string;
  token: string;
}

export interface SessionMetrics {
  usedTokens?: number;
  maxContextTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  fresh: boolean;
  model?: string;
  provider?: string;
  updatedAt?: string;
}

export interface SessionRecord {
  key: string;
  label?: string;
  createdAt: string;
}

export interface StudioSnapshot {
  connection: ConnectionStatus;
  seats: SeatState[];
  tasks: TaskItem[];
  chatMessages: ChatMessage[];
  activeSessionKey?: string;
  sessionMetrics: SessionMetrics;
  sessions: SessionRecord[];
}
