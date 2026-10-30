import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warn" | "danger";

export function Pill({
  children,
  tone = "neutral",
  dot,
  pulsing,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  pulsing?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" &&
          "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] text-[color:var(--color-text-secondary)]",
        tone === "accent" &&
          "border-[color:var(--color-accent-surface-border)] bg-[color:var(--color-accent-subtle)] text-[color:var(--color-accent-emphasis)]",
        tone === "success" &&
          "border-[color:var(--color-success-border)] bg-[color:var(--color-success-surface)] text-[color:var(--color-success-text)]",
        tone === "warn" &&
          "border-[color:var(--color-warn-border)] bg-[color:var(--color-warn-surface)] text-[color:var(--color-warn-text)]",
        tone === "danger" &&
          "border-[color:var(--color-danger-border)] bg-[color:var(--color-danger-surface)] text-[color:var(--color-danger-text)]",
        className
      )}
    >
      {dot ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            pulsing && "canvas-pulse-dot",
            tone === "neutral" && "bg-[color:var(--color-ink-400)]",
            tone === "accent" && "bg-[color:var(--color-snow-500)]",
            tone === "success" && "bg-[color:var(--color-success-500)]",
            tone === "warn" && "bg-[color:var(--color-warn-500)]",
            tone === "danger" && "bg-[color:var(--color-danger-500)]"
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
