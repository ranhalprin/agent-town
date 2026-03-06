"use client";

import { useEffect, useRef } from "react";
import type * as PhaserTypes from "phaser";

export default function PhaserGame() {
  const gameRef = useRef<PhaserTypes.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: PhaserTypes.Game | null = null;

    async function initGame() {
      if (!containerRef.current || gameRef.current) return;

      const { gameConfig } = await import("./config");
      const Phaser = await import("phaser");

      game = new Phaser.Game({
        ...gameConfig,
        parent: containerRef.current,
      });
      gameRef.current = game;
    }

    initGame();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
