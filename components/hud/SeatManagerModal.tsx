"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useStudio } from "@/lib/store";
import { WORKER_SPRITES } from "@/components/game/config/animations";
import type { SeatState } from "@/types/game";
import CharacterPortrait from "./CharacterPortrait";

const ROLE_PRESETS = [
  "Frontend Engineer",
  "Backend Engineer",
  "AI Agent",
  "Product Manager",
  "Designer",
  "QA",
  "Researcher",
];

function seatStateLabel(seat: SeatState) {
  if (!seat.assigned) return "vacant";
  if (seat.status === "empty") return "idle";
  return seat.status;
}

function seatSummary(seat: SeatState) {
  if (!seat.assigned) return "No crew assigned";
  if (seat.status === "returning") return seat.taskSnippet ?? "Returning to desk";
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
  const [draftSeatId, setDraftSeatId] = useState<string>("");
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [spriteKey, setSpriteKey] = useState("");
  const [spritePath, setSpritePath] = useState("");

  const selectedSeat = useMemo(
    () => seats.find((seat) => seat.seatId === selectedSeatId) ?? seats[0],
    [seats, selectedSeatId],
  );

  useEffect(() => {
    if (open && seats.length > 0 && !seats.find((s) => s.seatId === selectedSeatId)) {
      setSelectedSeatId(seats[0].seatId);
    }
  }, [open, seats, selectedSeatId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !selectedSeat) return null;

  const usingDraft = draftSeatId === selectedSeat.seatId;
  const effectiveName = usingDraft ? name : (selectedSeat.assigned ? selectedSeat.label : "");
  const effectiveRoleTitle = usingDraft ? roleTitle : (selectedSeat.roleTitle ?? "");
  const effectiveSpriteKey = usingDraft ? spriteKey : (selectedSeat.spriteKey ?? WORKER_SPRITES[0]?.key ?? "");
  const effectiveSpritePath = usingDraft ? spritePath : (selectedSeat.spritePath ?? WORKER_SPRITES[0]?.path ?? "");

  const assignedCount = seats.filter((seat) => seat.assigned).length;
  const busy = selectedSeat.status === "running" || selectedSeat.status === "returning";
  const canSave = Boolean(effectiveName.trim() && effectiveRoleTitle.trim() && effectiveSpriteKey && effectiveSpritePath && !busy);

  const beginDraftForSeat = (seat: SeatState) => {
    setDraftSeatId(seat.seatId);
    setName(seat.assigned ? seat.label : "");
    setRoleTitle(seat.roleTitle ?? "");
    setSpriteKey(seat.spriteKey ?? WORKER_SPRITES[0]?.key ?? "");
    setSpritePath(seat.spritePath ?? WORKER_SPRITES[0]?.path ?? "");
  };

  const handleSave = () => {
    if (!canSave) return;
    updateSeatConfig(selectedSeat.seatId, {
      assigned: true,
      label: effectiveName.trim(),
      roleTitle: effectiveRoleTitle.trim(),
      spriteKey: effectiveSpriteKey,
      spritePath: effectiveSpritePath,
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
      className="seat-manager-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="seat-manager pixel-panel">
        {/* Header */}
        <div className="seat-manager__header">
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

        {/* Seat list */}
        <div style={{ minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
          {seats.map((seat, index) => {
            const active = seat.seatId === selectedSeat.seatId;
            const statusLabel = seatStateLabel(seat);
            return (
              <button
                key={seat.seatId}
                type="button"
                className={`seat-card ${active ? "seat-card--active" : ""}`}
                onClick={() => {
                  setSelectedSeatId(seat.seatId);
                  beginDraftForSeat(seat);
                }}
              >
                <div className="seat-card__info">
                  <div className={`seat-manager__portrait-frame seat-manager__portrait-frame--small`}>
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
                  <div className={`seat-card__status ${statusLabel === "running" ? "seat-card__status--running" : ""}`}
                    style={{ color: statusLabel === "vacant" ? "var(--pixel-muted)" : "var(--pixel-text)" }}
                  >
                    {statusLabel}
                  </div>
                </div>
                <div className="seat-card__summary">{seatSummary(seat)}</div>
              </button>
            );
          })}
        </div>

        {/* Detail editor */}
        <div style={{ minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "auto auto 1fr auto", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12 }}>
            <div className="seat-manager__portrait-frame seat-manager__portrait-frame--large">
              {effectiveSpritePath ? (
                <CharacterPortrait spritePath={effectiveSpritePath} name={effectiveName || "Crew preview"} large />
              ) : (
                <div style={{ fontSize: 8, color: "var(--pixel-muted)" }}>No character assigned</div>
              )}
            </div>

            <div className="hud-panel__stack" style={{ gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12 }}>{selectedSeat.assigned ? effectiveName || selectedSeat.label : "Vacant Seat"}</div>
                  <div style={{ fontSize: 8, color: "var(--pixel-muted)", marginTop: 4 }}>
                    {selectedSeat.seatId} · facing {selectedSeat.spawnFacing ?? "down"}
                  </div>
                </div>
                <div style={{ fontSize: 7, padding: "4px 8px", background: "rgba(255,255,255,0.06)", color: selectedSeat.assigned ? "var(--pixel-text)" : "var(--pixel-muted)" }}>
                  {seatStateLabel(selectedSeat)}
                </div>
              </div>

              <div>
                <label className="hud-panel__label">Name</label>
                <input
                  className="pixel-input hud-panel__input"
                  value={effectiveName}
                  onChange={(event) => { if (!usingDraft) beginDraftForSeat(selectedSeat); setName(event.target.value); }}
                  disabled={busy}
                  placeholder="Crew name"
                  style={{ minHeight: 0 }}
                />
              </div>

              <div>
                <label className="hud-panel__label">Role / Title</label>
                <input
                  className="pixel-input hud-panel__input"
                  value={effectiveRoleTitle}
                  onChange={(event) => { if (!usingDraft) beginDraftForSeat(selectedSeat); setRoleTitle(event.target.value); }}
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
                      onClick={() => { if (!usingDraft) beginDraftForSeat(selectedSeat); setRoleTitle(preset); }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="seat-hint">
            {busy
              ? "This seat is currently active. Finish or stop the task before changing crew assignment."
              : "Select a portrait, set name and role, then save. Empty seats can be assigned immediately."}
          </div>

          <div className="seat-manager__sprite-grid">
            {WORKER_SPRITES.map((sprite) => {
              const active = sprite.key === effectiveSpriteKey;
              return (
                <button
                  key={sprite.key}
                  type="button"
                  className={`seat-card ${active ? "seat-card--active" : ""}`}
                  onClick={() => {
                    if (!usingDraft) beginDraftForSeat(selectedSeat);
                    setSpriteKey(sprite.key);
                    setSpritePath(sprite.path);
                    if (!effectiveName.trim()) setName(sprite.label);
                  }}
                  disabled={busy}
                  style={{ opacity: busy ? 0.65 : 1, cursor: busy ? "not-allowed" : "pointer" }}
                >
                  <div className="seat-manager__sprite-preview">
                    <CharacterPortrait spritePath={sprite.path} name={sprite.label} />
                  </div>
                  <div style={{ fontSize: 9, marginTop: 8 }}>{sprite.label}</div>
                  <div style={{ fontSize: 7, color: "var(--pixel-muted)", marginTop: 2 }}>{sprite.key}</div>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <button type="button" className="pixel-button" onClick={handleUnassign} disabled={!selectedSeat.assigned || busy}>
              Unassign
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="pixel-button" onClick={onClose}>Close</button>
              <button type="button" className="pixel-button pixel-button--primary" onClick={handleSave} disabled={!canSave}>
                {selectedSeat.assigned ? "Save Changes" : "Assign Character"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
