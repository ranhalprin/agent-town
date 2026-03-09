"use client";

import dynamic from "next/dynamic";
import { StudioProvider } from "@/lib/store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import TerminalModal from "@/components/panel/TerminalModal";
import GameHud from "@/components/hud/GameHud";

const PhaserGame = dynamic(() => import("@/components/game/PhaserGame"), {
  ssr: false,
});

export default function Page() {
  return (
    <ErrorBoundary>
      <StudioProvider>
        <main
          className="flex w-screen h-screen overflow-hidden"
          style={{ background: "var(--pixel-bg)" }}
        >
          <div className="flex-1 min-w-0 h-full relative overflow-hidden">
            <PhaserGame />
          </div>
          <div className="w-80 shrink-0 h-full relative">
            <GameHud />
          </div>
          <TerminalModal />
        </main>
      </StudioProvider>
    </ErrorBoundary>
  );
}
