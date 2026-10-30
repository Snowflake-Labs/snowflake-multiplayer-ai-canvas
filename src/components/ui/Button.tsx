import { cn } from "@/lib/cn";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-[8px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-snow-400)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-surface-base)]",
        size === "md" && "h-9 px-4 text-sm",
        size === "sm" && "h-7 px-3 text-xs",
        variant === "primary" &&
          "bg-[color:var(--color-accent)] text-[color:var(--color-accent-fg)] hover:bg-[color:var(--color-accent-hover)]",
        variant === "secondary" &&
          "border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-surface-sunken)]",
        variant === "ghost" &&
          "text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-text-primary)]",
        variant === "danger" &&
          "bg-[color:var(--color-danger-500)] text-[color:var(--color-text-inverse)] hover:bg-[color:var(--color-danger-hover)]",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
