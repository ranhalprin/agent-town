import * as Phaser from "phaser";
import { OfficeScene } from "./scenes/OfficeScene";
import { GAME_WIDTH, GAME_HEIGHT } from "@/lib/constants";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scene: [OfficeScene],
  scale: {
    mode: Phaser.Scale.ENVELOP,
    autoCenter: Phaser.Scale.CENTER_VERTICALLY,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
    },
  },
};
