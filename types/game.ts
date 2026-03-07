// --- Studio domain types ---

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type SeatFacing = "right" | "up" | "left" | "down";

export type SeatStatus = "empty" | "running" | "done" | "failed";

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
  | "running"
  | "completed"
  | "failed";

export interface TaskItem {
  taskId: string;
  message: string;
  status: TaskStatus;
  runId?: string;
  actorName?: string;
  result?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ChatMessage {
  id: string;
  runId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: string;
  actorName?: string;
  /** true while assistant message is still receiving streaming deltas */
  streaming?: boolean;
  /** tool call: structured name + input + output */
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
}

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
