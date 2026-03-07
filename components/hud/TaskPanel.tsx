"use client";

import type { TaskItem } from "@/types/game";
import { formatRelativeTime } from "@/lib/constants";
import HudFlyout from "./HudFlyout";

export default function TaskPanel({ tasks }: { tasks: TaskItem[] }) {
  const runningTasks = tasks.filter((task) => task.status === "running" || task.status === "submitted");

  return (
    <HudFlyout title="Tasks" subtitle={`${runningTasks.length} active / ${tasks.length} total`}>
      <div className="hud-list">
        {tasks.length === 0 ? (
          <div className="hud-empty">No tasks yet.</div>
        ) : (
          tasks.slice(0, 10).map((task) => (
            <div key={task.taskId} className="hud-list__item">
              <div className="hud-list__top">
                <span className={`hud-status hud-status--${task.status}`}>{task.status}</span>
                <span>{formatRelativeTime(task.completedAt ?? task.createdAt)}</span>
              </div>
              <div className="hud-list__title">{task.message}</div>
            </div>
          ))
        )}
      </div>
    </HudFlyout>
  );
}
