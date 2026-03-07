"use client";

import type { ReactNode } from "react";

interface HudFlyoutProps {
  title: string;
  subtitle?: string;
  headerAction?: ReactNode;
  children: ReactNode;
}

export default function HudFlyout({ title, subtitle, headerAction, children }: HudFlyoutProps) {
  return (
    <div className="hud-flyout pixel-panel">
      <div className="hud-flyout__header">
        <div>
          <div className="hud-flyout__title">{title}</div>
          {subtitle ? <div className="hud-flyout__subtitle">{subtitle}</div> : null}
        </div>
        {headerAction ?? null}
      </div>
      <div className="hud-flyout__body">{children}</div>
    </div>
  );
}
