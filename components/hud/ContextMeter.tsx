"use client";

interface ContextMeterProps {
  usedTokens?: number;
  maxTokens?: number;
  fresh: boolean;
}

function formatCompact(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

export default function ContextMeter({
  usedTokens,
  maxTokens,
  fresh,
}: ContextMeterProps) {
  const hasValues =
    typeof usedTokens === "number" &&
    Number.isFinite(usedTokens) &&
    typeof maxTokens === "number" &&
    Number.isFinite(maxTokens) &&
    maxTokens > 0;
  const remaining = hasValues ? Math.max(1 - usedTokens / maxTokens, 0) : 1;
  const remainPct = Math.round(remaining * 100);

  const barColor = !fresh
    ? "linear-gradient(90deg, #6b7280, #94a3b8)"
    : remaining > 0.5
      ? "linear-gradient(90deg, #22a44b, #4ade80)"
      : remaining > 0.2
        ? "linear-gradient(90deg, #b8860b, #facc15)"
        : "linear-gradient(90deg, #a61123, #ef4444)";

  return (
    <div className="hud-meter hud-meter--compact">
      <div className="hud-meter__topline">
        <span className="hud-meter__label">Context</span>
        <div className="hud-meter__meta">
          <span className="hud-meter__value">
            {hasValues
              ? `${formatCompact(maxTokens! - usedTokens!)} left`
              : "No session"}
          </span>
          {!fresh && <span className="hud-meter__stale">stale</span>}
        </div>
      </div>
      <div className="hud-meter__bar">
        <div
          style={{
            width: `${remainPct}%`,
            height: "100%",
            background: barColor,
            transition: "width 0.4s ease, background 0.4s ease",
          }}
        />
      </div>
      <div className="hud-meter__bottomline">
        <span>{hasValues ? `${remainPct}% remaining` : "Waiting for context"}</span>
      </div>
    </div>
  );
}
