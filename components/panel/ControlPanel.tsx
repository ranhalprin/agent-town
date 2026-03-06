"use client";

import { useState } from "react";
import { useStudio } from "@/lib/store";
import type { ConnectionStatus, TaskItem } from "@/types/game";

function ConnectionDot({ status }: { status: ConnectionStatus }) {
  const dotClass =
    status === "connected"
      ? "pixel-dot--green"
      : status === "connecting"
        ? "pixel-dot--yellow"
        : "pixel-dot--red";

  return <span className={`pixel-dot ${dotClass}`} />;
}

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  disconnected: "Offline",
  connecting: "Connecting...",
  connected: "Online",
  error: "Error",
};

function TaskRow({ task }: { task: TaskItem }) {
  const dotClass =
    task.status === "completed"
      ? "pixel-dot--green"
      : task.status === "running"
        ? "pixel-dot--yellow"
        : task.status === "failed"
          ? "pixel-dot--red"
          : "pixel-dot--gray";

  return (
    <div className="flex items-start gap-2 py-1 border-b border-[var(--pixel-border)]">
      <span className={`pixel-dot ${dotClass} mt-1 shrink-0`} />
      <div className="min-w-0">
        <div className="truncate">{task.message}</div>
        <div style={{ color: "var(--pixel-muted)", fontSize: "8px" }}>
          {task.status}
        </div>
      </div>
    </div>
  );
}

export default function ControlPanel() {
  const { state, connect, disconnect, dispatchTask } = useStudio();
  const [input, setInput] = useState("");

  const isConnected = state.connection === "connected";
  const isConnecting = state.connection === "connecting";
  const hasEmptySeat = state.seats.some((s) => s.status === "empty");

  const handleDispatch = () => {
    const trimmed = input.trim();
    if (!trimmed || !isConnected) return;
    dispatchTask(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleDispatch();
    }
  };

  return (
    <div
      className="pixel-panel flex flex-col h-full"
      style={{ padding: "16px" }}
    >
      {/* Header */}
      <div
        className="text-center"
        style={{
          marginBottom: "16px",
          paddingBottom: "12px",
          borderBottom: "3px solid var(--pixel-border)",
        }}
      >
        <h1 style={{ fontSize: "12px", marginBottom: "4px" }}>Agent World</h1>
        <div style={{ fontSize: "8px", color: "var(--pixel-muted)" }}>
          Local Studio
        </div>
      </div>

      {/* Connection */}
      <div
        style={{
          marginBottom: "16px",
          paddingBottom: "12px",
          borderBottom: "3px solid var(--pixel-border)",
        }}
      >
        <div className="flex items-center gap-2" style={{ marginBottom: "8px" }}>
          <ConnectionDot status={state.connection} />
          <span>{STATUS_LABELS[state.connection]}</span>
        </div>
        {isConnected ? (
          <button className="pixel-button w-full" onClick={disconnect}>
            Disconnect
          </button>
        ) : (
          <button
            className="pixel-button pixel-button--primary w-full"
            onClick={() => connect()}
            disabled={isConnecting}
          >
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
        )}
      </div>

      {/* Task Input */}
      <div style={{ marginBottom: "12px" }}>
        <label
          style={{
            display: "block",
            marginBottom: "6px",
            fontSize: "8px",
            color: "var(--pixel-muted)",
            textTransform: "uppercase",
          }}
        >
          Task
        </label>
        <textarea
          className="pixel-input"
          placeholder={
            isConnected ? "Describe your task..." : "Connect first..."
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isConnected}
        />
        <button
          className="pixel-button pixel-button--primary w-full"
          style={{ marginTop: "8px" }}
          onClick={handleDispatch}
          disabled={!isConnected || !input.trim() || !hasEmptySeat}
        >
          {!hasEmptySeat ? "All Seats Busy" : "Dispatch"}
        </button>
      </div>

      {/* Seats Overview */}
      <div
        style={{
          marginBottom: "12px",
          paddingBottom: "8px",
          borderBottom: "3px solid var(--pixel-border)",
        }}
      >
        <div
          style={{
            fontSize: "8px",
            color: "var(--pixel-muted)",
            textTransform: "uppercase",
            marginBottom: "6px",
          }}
        >
          Seats
        </div>
        <div className="grid grid-cols-2 gap-2">
          {state.seats.map((seat) => {
            const dotClass =
              seat.status === "running"
                ? "pixel-dot--green"
                : seat.status === "done"
                  ? "pixel-dot--yellow"
                  : seat.status === "failed"
                    ? "pixel-dot--red"
                    : "pixel-dot--gray";
            return (
              <div key={seat.seatId} className="flex items-center gap-1">
                <span className={`pixel-dot ${dotClass}`} />
                <span style={{ fontSize: "8px" }}>{seat.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task History */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div
          style={{
            fontSize: "8px",
            color: "var(--pixel-muted)",
            textTransform: "uppercase",
            marginBottom: "6px",
          }}
        >
          Tasks
        </div>
        <div className="flex-1 overflow-y-auto">
          {state.tasks.length === 0 ? (
            <div
              style={{
                color: "var(--pixel-muted)",
                fontSize: "8px",
                textAlign: "center",
                marginTop: "16px",
              }}
            >
              No tasks yet
            </div>
          ) : (
            state.tasks.map((task) => (
              <TaskRow key={task.taskId} task={task} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
