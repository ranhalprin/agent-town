export interface AgentState {
  id: string;
  name: string;
  status: "idle" | "working" | "talking";
  x: number;
  y: number;
}
