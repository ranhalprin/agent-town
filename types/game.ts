export interface AgentState {
  id: string;
  name: string;
  status: "idle" | "working" | "talking";
  x: number;
  y: number;
}

// --- Studio domain types ---

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type SeatStatus = "empty" | "running" | "done" | "failed";

export interface SeatState {
  seatId: string;
  label: string;
  status: SeatStatus;
  taskSnippet?: string;
  runId?: string;
  startedAt?: string;
}

export type TaskStatus =
  | "submitted"
  | "accepted"
  | "running"
  | "completed"
  | "failed";

export interface TaskItem {
  taskId: string;
  message: string;
  status: TaskStatus;
  runId?: string;
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

export interface StudioSnapshot {
  connection: ConnectionStatus;
  seats: SeatState[];
  tasks: TaskItem[];
  chatMessages: ChatMessage[];
}
