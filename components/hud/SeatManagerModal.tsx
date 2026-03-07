"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useStudio } from "@/lib/store";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  SHEET_COLUMNS,
  WORKER_SPRITES,
} from "@/components/game/config/animations";
import type { SeatState } from "@/types/game";

const ROLE_PRESETS = [
  "Frontend Engineer",
  "Backend Engineer",
  "AI Agent",
  "Product Manager",
  "Designer",
  "QA",
  "Researcher",
];

const PORTRAIT_FRAME_INDEX = SHEET_COLUMNS + 18;

function CharacterPortrait({
  spritePath,
  name,
  large = false,
}: {
  spritePath?: string;
  name: string;
  large?: boolean;
}) {
  const scale = large ? 2.4 : 1.1;
  const width = FRAME_WIDTH * scale;
  const height = FRAME_HEIGHT * scale;
  const frameX = (PORTRAIT_FRAME_INDEX % SHEET_COLUMNS) * FRAME_WIDTH;
  const frameY = Math.floor(PORTRAIT_FRAME_INDEX / SHEET_COLUMNS) * FRAME_HEIGHT;

  if (!spritePath) {
    return <span style={{ fontSize: 8, color: "var(--pixel-muted)" }}>EMPTY</span>;
  }

  return (
    <div
      aria-label={name}
      style={{
        width,
        height,
        backgroundImage: `url(${spritePath})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: `-${frameX * scale}px -${frameY * scale}px`,
        backgroundSize: `${SHEET_COLUMNS * FRAME_WIDTH * scale}px auto`,
        imageRendering: "pixelated",
        flexShrink: 0,
      }}
    />
  );
}

function seatStateLabel(seat: SeatState) {
  if (!seat.assigned) return "vacant";
  if (seat.status === "empty") return "idle";
  return seat.status;
}

function seatSummary(seat: SeatState) {
  if (!seat.assigned) return "No crew assigned";
  if (seat.status === "running") return seat.taskSnippet ?? "Handling task";
  if (seat.status === "done") return "Recently completed task";
  if (seat.status === "failed") return "Last task failed";
  return "Waiting at desk";
}

export default function SeatManagerModal({
  open,
  onClose,
  seats,
}: {
  open: boolean;
  onClose: () => void;
  seats: SeatState[];
}) {
  const { updateSeatConfig } = useStudio();
  const [selectedSeatId, setSelectedSeatId] = useState<string>("");
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [spriteKey, setSpriteKey] = useState("");
  const [spritePath, setSpritePath] = useState("");

  useEffect(() => {
    if (!open) return;
    if (!selectedSeatId || !seats.some((seat) => seat.seatId === selectedSeatId)) {
      setSelectedSeatId(seats[0]?.seatId ?? "");
    }
  }, [open, seats, selectedSeatId]);

  const selectedSeat = useMemo(
    () => seats.find((seat) => seat.seatId === selectedSeatId) ?? seats[0],
    [seats, selectedSeatId],
  );

  useEffect(() => {
    if (!selectedSeat) return;
    setName(selectedSeat.assigned ? selectedSeat.label : "");
    setRoleTitle(selectedSeat.roleTitle ?? "");
    setSpriteKey(selectedSeat.spriteKey ?? WORKER_SPRITES[0]?.key ?? "");
    setSpritePath(selectedSeat.spritePath ?? WORKER_SPRITES[0]?.path ?? "");
  }, [selectedSeat]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !selectedSeat) return null;

  const assignedCount = seats.filter((seat) => seat.assigned).length;
  const busy = selectedSeat.status === "running";
  const canSave = Boolean(name.trim() && roleTitle.trim() && spriteKey && spritePath && !busy);

  const handleSave = () => {
    if (!canSave) return;
    updateSeatConfig(selectedSeat.seatId, {
      assigned: true,
      label: name.trim(),
      roleTitle: roleTitle.trim(),
      spriteKey,
      spritePath,
    });
  };

  const handleUnassign = () => {
    if (busy) return;
    updateSeatConfig(selectedSeat.seatId, {
      assigned: false,
      roleTitle: undefined,
      spriteKey: undefined,
      spritePath: undefined,
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(4, 10, 18, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "auto",
        padding: 24,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="pixel-panel"
        style={{
          width: "min(1080px, 94vw)",
          height: "min(680px, 88vh)",
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          gridTemplateRows: "auto 1fr",
          gap: 12,
          padding: 14,
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderBottom: "2px solid rgba(255,255,255,0.08)",
            paddingBottom: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: "var(--pixel-text)" }}>Team Management</div>
            <div style={{ fontSize: 8, color: "var(--pixel-muted)", marginTop: 4 }}>
              {seats.length} seats · {assignedCount} assigned · {seats.length - assignedCount} empty
            </div>
          </div>
          <button
            type="button"
            className="pixel-icon-btn"
            style={{ width: 38, height: 38, minWidth: 38, minHeight: 38 }}
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            paddingRight: 4,
          }}
        >
          {seats.map((seat, index) => {
            const active = seat.seatId === selectedSeat.seatId;
            const statusLabel = seatStateLabel(seat);
            return (
              <button
                key={seat.seatId}
                type="button"
                onClick={() => setSelectedSeatId(seat.seatId)}
                style={{
                  border: active ? "2px solid var(--pixel-accent)" : "2px solid rgba(255,255,255,0.08)",
                  background: active ? "rgba(233, 69, 96, 0.14)" : "rgba(8, 14, 24, 0.45)",
                  padding: 10,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "var(--pixel-font)",
                  color: "var(--pixel-text)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 52,
                      height: 64,
                      border: "2px solid rgba(255,255,255,0.08)",
                      background: "#0d1b2a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    {seat.assigned && seat.spritePath ? (
                      <CharacterPortrait spritePath={seat.spritePath} name={seat.label} />
                    ) : (
                      <span style={{ fontSize: 8, color: "var(--pixel-muted)" }}>EMPTY</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 8, color: "var(--pixel-muted)" }}>Seat {index + 1}</div>
                    <div style={{ fontSize: 10, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {seat.assigned ? seat.label : "Vacant Seat"}
                    </div>
                    <div style={{ fontSize: 8, color: "var(--pixel-muted)", marginTop: 4 }}>
                      {seat.assigned ? seat.roleTitle ?? "Agent" : "Unassigned"}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 7,
                      color: statusLabel === "vacant" ? "var(--pixel-muted)" : "var(--pixel-text)",
                      background: statusLabel === "running" ? "rgba(250, 204, 21, 0.16)" : "rgba(255,255,255,0.06)",
                      padding: "4px 6px",
                      flexShrink: 0,
                    }}
                  >
                    {statusLabel}
                  </div>
                </div>
                <div style={{ fontSize: 8, color: "var(--pixel-muted)", marginTop: 8 }}>
                  {seatSummary(seat)}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "auto auto 1fr auto", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12 }}>
            <div
              style={{
                border: "2px solid rgba(255,255,255,0.08)",
                background: "#0d1b2a",
                minHeight: 260,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {spritePath ? (
                <CharacterPortrait spritePath={spritePath} name={name || "Crew preview"} large />
              ) : (
                <div style={{ fontSize: 8, color: "var(--pixel-muted)" }}>No character assigned</div>
              )}
            </div>

            <div className="hud-panel__stack" style={{ gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12 }}>{selectedSeat.assigned ? name || selectedSeat.label : "Vacant Seat"}</div>
                  <div style={{ fontSize: 8, color: "var(--pixel-muted)", marginTop: 4 }}>
                    {selectedSeat.seatId} · facing {selectedSeat.spawnFacing ?? "down"}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 7,
                    padding: "4px 8px",
                    background: "rgba(255,255,255,0.06)",
                    color: selectedSeat.assigned ? "var(--pixel-text)" : "var(--pixel-muted)",
                  }}
                >
                  {seatStateLabel(selectedSeat)}
                </div>
              </div>

              <div>
                <label className="hud-panel__label">Name</label>
                <input
                  className="pixel-input hud-panel__input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                  placeholder="Crew name"
                  style={{ minHeight: 0 }}
                />
              </div>

              <div>
                <label className="hud-panel__label">Role / Title</label>
                <input
                  className="pixel-input hud-panel__input"
                  value={roleTitle}
                  onChange={(event) => setRoleTitle(event.target.value)}
                  disabled={busy}
                  placeholder="Role title"
                  style={{ minHeight: 0 }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {ROLE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="pixel-button"
                      style={{ fontSize: 7, padding: "4px 6px" }}
                      disabled={busy}
                      onClick={() => setRoleTitle(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              border: "2px solid rgba(255,255,255,0.08)",
              background: "rgba(8, 14, 24, 0.3)",
              padding: 10,
              fontSize: 8,
              color: "var(--pixel-muted)",
            }}
          >
            {busy
              ? "This seat is currently running a task. Finish or stop the task before changing crew assignment."
              : "Select a portrait, set name and role, then save. Empty seats can be assigned immediately."}
          </div>

          <div
            style={{
              minHeight: 0,
              overflowY: "auto",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 10,
              paddingRight: 4,
            }}
          >
            {WORKER_SPRITES.map((sprite) => {
              const active = sprite.key === spriteKey;
              return (
                <button
                  key={sprite.key}
                  type="button"
                  onClick={() => {
                    setSpriteKey(sprite.key);
                    setSpritePath(sprite.path);
                    if (!name.trim()) setName(sprite.label);
                  }}
                  disabled={busy}
                  style={{
                    border: active ? "2px solid var(--pixel-accent)" : "2px solid rgba(255,255,255,0.08)",
                    background: active ? "rgba(233, 69, 96, 0.14)" : "rgba(8, 14, 24, 0.45)",
                    padding: 8,
                    textAlign: "left",
                    cursor: busy ? "not-allowed" : "pointer",
                    fontFamily: "var(--pixel-font)",
                    color: "var(--pixel-text)",
                    opacity: busy ? 0.65 : 1,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: 120,
                      border: "2px solid rgba(255,255,255,0.08)",
                      background: "#0d1b2a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    <CharacterPortrait spritePath={sprite.path} name={sprite.label} />
                  </div>
                  <div style={{ fontSize: 9, marginTop: 8 }}>{sprite.label}</div>
                  <div style={{ fontSize: 7, color: "var(--pixel-muted)", marginTop: 2 }}>{sprite.key}</div>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <button
              type="button"
              className="pixel-button"
              onClick={handleUnassign}
              disabled={!selectedSeat.assigned || busy}
            >
              Unassign
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="pixel-button" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="pixel-button pixel-button--primary"
                onClick={handleSave}
                disabled={!canSave}
              >
                {selectedSeat.assigned ? "Save Changes" : "Assign Character"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
