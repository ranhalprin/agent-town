import type { SeatState } from "@/types/game";
import type { SeatDef } from "@/components/game/utils/MapHelpers";

export interface GameEventMap {
  "seats-discovered": [seats: SeatDef[]];
  "seat-configs-updated": [seats: SeatState[]];
  "task-assigned": [runId: string, message: string, seatId?: string];
  "task-bubble": [runId: string, text: string, ttl: number];
  "task-completed": [runId: string];
  "task-failed": [runId: string];
  "subagent-assigned": [runId: string, parentRunId: string, label: string];
  "open-terminal": [seatId?: string];
  "open-terminal-queue": [seatId: string];
  "stop-task": [runId: string, seatId: string];
  "terminal-closed": [];
}

type Listener<T extends unknown[]> = (...args: T) => void;

class GameEventBus {
  private listeners = new Map<string, Set<Listener<unknown[]>>>();

  on<K extends keyof GameEventMap>(event: K, fn: Listener<GameEventMap[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as Listener<unknown[]>);
    return () => this.off(event, fn);
  }

  off<K extends keyof GameEventMap>(event: K, fn: Listener<GameEventMap[K]>) {
    this.listeners.get(event)?.delete(fn as Listener<unknown[]>);
  }

  emit<K extends keyof GameEventMap>(event: K, ...args: GameEventMap[K]) {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }
}

export const gameEvents = new GameEventBus();
