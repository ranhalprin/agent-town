/**
 * Character spritesheet animation configuration.
 *
 * Premade_Character_48x48_01.png (2688×1968):
 *   48×96 frames, 56 cols × 20 rows (last 48px row unused)
 *     Row 0: preview/idle thumbnails
 *     Row 1: idle — right(6) · up(6) · left(6) · down(6)
 *     Row 2: walk — right(6) · up(6) · left(6) · down(6)
 */

export const SPRITE_KEY = "character_01";
export const SPRITE_PATH = "/characters/Premade_Character_48x48_01.png";

export const FRAME_WIDTH = 48;
export const FRAME_HEIGHT = 96;
export const SHEET_COLUMNS = 56;

const FRAMES_PER_DIR = 6;

/** Pixel/sec movement speed */
export const MOVE_SPEED = 160;

export interface AnimDef {
  key: string;
  start: number;
  end: number;
  frameRate: number;
  repeat: number;
}

const directions = ["right", "up", "left", "down"] as const;

function rowAnims(prefix: string, row: number, frameRate: number): AnimDef[] {
  return directions.map((dir, i) => ({
    key: `${prefix}-${dir}`,
    start: row * SHEET_COLUMNS + i * FRAMES_PER_DIR,
    end: row * SHEET_COLUMNS + i * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
    frameRate,
    repeat: -1,
  }));
}

export const IDLE_ANIMS = rowAnims("idle", 1, 8);
export const WALK_ANIMS = rowAnims("walk", 2, 10);

export const ALL_ANIMS: AnimDef[] = [...IDLE_ANIMS, ...WALK_ANIMS];
