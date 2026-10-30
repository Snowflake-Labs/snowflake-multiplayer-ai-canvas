"use client";

import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/use-theme";

export function Avatar({
  name,
  variant = "person",
  size = 28,
  online,
  title,
}: {
  name: string;
  variant?: "person" | "agent" | "system";
  size?: number;
  online?: boolean;
  title?: string;
}) {
  const initials = pickInitials(name);
  const style = { width: size, height: size };
  const theme = useTheme();
  const spooky = theme === "halloween" && variant === "agent";

  return (
    <div className="relative inline-flex" title={title ?? name}>
      <div
        className={cn(
          "inline-flex items-center justify-center rounded-full text-[11px] font-semibold uppercase",
          variant === "person" &&
            "bg-[color:var(--color-ink-200)] text-[color:var(--color-ink-700)]",
          variant === "agent" &&
            "bg-[color:var(--color-snow-500)] text-[color:var(--color-ink-0)] ring-2 ring-[color:var(--color-snow-100)]",
          variant === "system" &&
            "bg-[color:var(--color-ink-800)] text-[color:var(--color-ink-100)]"
        )}
        style={style}
      >
        {variant === "agent" ? <AgentGlyph /> : initials}
      </div>
      {spooky ? (
        <span
          className="pointer-events-none absolute -top-2 -right-1 text-[14px] leading-none select-none"
          aria-hidden="true"
        >
          🎃
        </span>
      ) : null}
      {online ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[color:var(--color-success-500)] ring-2 ring-[color:var(--color-surface-raised)]"
          aria-label="online"
        />
      ) : null}
    </div>
  );
}

function pickInitials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 _-]/g, "").split(/[ _-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AgentGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="16" y1="4" x2="16" y2="28" />
        <line x1="5.5" y1="10" x2="26.5" y2="22" />
        <line x1="5.5" y1="22" x2="26.5" y2="10" />
      </g>
    </svg>
  );
}
