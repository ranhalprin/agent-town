"use client";

import dynamic from "next/dynamic";
import { StudioProvider } from "@/lib/store";
import TerminalModal from "@/components/panel/TerminalModal";
import GameHud from "@/components/hud/GameHud";

const PhaserGame = dynamic(() => import("@/components/game/PhaserGame"), {
  ssr: false,
});

export default function Page() {
  return (
    <StudioProvider>
      <main
        className="relative w-screen h-screen overflow-hidden"
        style={{ background: "var(--pixel-bg)" }}
      >
        <PhaserGame />
        <GameHud />
        <TerminalModal />
      </main>
    </StudioProvider>
  );
}
