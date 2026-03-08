"use client";

import Image from "next/image";

export type HudPanelId = "connection" | "chat" | "tasks" | "workers" | "music";

export interface HudDockItem {
  id: HudPanelId;
  label: string;
  icon: string;
  iconActive: string;
}

interface HudDockProps {
  items: HudDockItem[];
  openPanel: HudPanelId | null;
  onToggle: (id: HudPanelId) => void;
  iconOverrides?: Partial<Record<HudPanelId, string>>;
}

export default function HudDock({ items, openPanel, onToggle, iconOverrides }: HudDockProps) {
  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 4 }}>
      {items.map((item) => {
        const active = openPanel === item.id;
        const override = iconOverrides?.[item.id];
        const src = override ?? (active ? item.iconActive : item.icon);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            title={item.label}
            style={{
              display: "block",
              width: 42,
              height: 42,
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              imageRendering: "pixelated",
              transition: "transform 0.1s",
              transform: active ? "translateY(1px)" : undefined,
            }}
          >
            <Image
              src={src}
              alt={item.label}
              width={42}
              height={42}
              style={{ imageRendering: "pixelated", display: "block" }}
              unoptimized
            />
          </button>
        );
      })}
    </div>
  );
}
