"use client";

import type { SeatState } from "@/types/game";
import HudFlyout from "./HudFlyout";

function seatStatusLabel(seat: SeatState) {
  if (!seat.assigned) return "vacant";
  if (seat.status === "empty") return "idle";
  return seat.status;
}

export default function WorkerPanel({
  seats,
  onOpenManager,
}: {
  seats: SeatState[];
  onOpenManager: () => void;
}) {
  const assigned = seats.filter((s) => s.assigned).length;
  const working = seats.filter((s) => s.assigned && (s.status === "running" || s.status === "returning")).length;

  return (
    <HudFlyout
      title="Employees"
      subtitle={`${working}/${assigned} busy · ${assigned}/${seats.length} seat`}
      headerAction={
        <button
          type="button"
          className="pixel-button pixel-button--primary"
          style={{ fontSize: 7, padding: "4px 8px" }}
          onClick={onOpenManager}
        >
          Manage Seats
        </button>
      }
    >
      <div className="hud-workers">
        {seats.map((seat) => (
          <div key={seat.seatId} className="hud-workers__item">
            <div className="hud-workers__top">
              <span className={`hud-status hud-status--${seat.status}`}>{seatStatusLabel(seat)}</span>
              <span>{seat.assigned ? seat.label : "Vacant Seat"}</span>
            </div>
            <div className="hud-workers__task">
              {seat.assigned ? seat.taskSnippet ?? `${seat.roleTitle ?? "Agent"} waiting at desk` : "Assign a crew member to this seat"}
            </div>
          </div>
        ))}
      </div>
    </HudFlyout>
  );
}
