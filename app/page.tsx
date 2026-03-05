"use client";

import dynamic from "next/dynamic";

const PhaserGame = dynamic(() => import("@/components/game/PhaserGame"), {
  ssr: false,
});

export default function Page() {
  return (
    <main className="flex h-screen items-center justify-center bg-black">
      <PhaserGame />
    </main>
  );
}
