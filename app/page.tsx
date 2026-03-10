"use client";

import dynamic from "next/dynamic";
import { StudioProvider } from "@/lib/store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import TerminalModal from "@/components/panel/TerminalModal";
import WorkerSessionHistoryModal from "@/components/panel/WorkerSessionHistoryModal";
import GameHud from "@/components/hud/GameHud";

const PhaserGame = dynamic(() => import("@/components/game/PhaserGame"), {
  ssr: false,
});

export default function Page() {
  return (
    <ErrorBoundary>
      <StudioProvider>
        <main
          className="relative w-screen h-screen overflow-hidden"
          style={{ background: "var(--pixel-bg)" }}
        >
          <div className="absolute inset-0">
            <PhaserGame />
          </div>
          <div className="absolute inset-0 pointer-events-none">
            <GameHud />
          </div>
          <TerminalModal />
          <WorkerSessionHistoryModal />
        </main>
      </StudioProvider>
    </ErrorBoundary>
  );
}
