"use client";

import type { SeatState } from "@/types/game";
import HudFlyout from "./HudFlyout";

export default function WorkerPanel({
  seats,
  onOpenManager,
}: {
  seats: SeatState[];
  onOpenManager: () => void;
}) {
  const active = seats.filter((seat) => seat.status === "running").length;

  return (
    <HudFlyout
      title="Employees"
      subtitle={`${active}/${seats.length} currently busy`}
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
              <span className={`hud-status hud-status--${seat.status}`}>{seat.assigned ? seat.status : "vacant"}</span>
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
