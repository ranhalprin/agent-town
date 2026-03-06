"use client";

import dynamic from "next/dynamic";
import { StudioProvider } from "@/lib/store";
import StatusHUD from "@/components/panel/StatusHUD";
import TerminalModal from "@/components/panel/TerminalModal";
import ChatPanel from "@/components/panel/ChatPanel";

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

        {/* Right sidebar: connection + chat */}
        <div
          className="absolute flex flex-col"
          style={{
            top: "12px",
            right: "12px",
            bottom: "12px",
            width: "340px",
            gap: "8px",
            pointerEvents: "none",
            zIndex: 20,
          }}
        >
          <StatusHUD />
          <ChatPanel />
        </div>

        <TerminalModal />
      </main>
    </StudioProvider>
  );
}
