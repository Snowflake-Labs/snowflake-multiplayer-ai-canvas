"use client";

import { useMemo } from "react";
import { VegaEmbed } from "react-vega";
import type { VisualizationSpec } from "vega-embed";
import { cn } from "@/lib/cn";
import { type Theme } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

interface ChartCardProps {
  spec: unknown;
  title?: string;
  caption?: string;
}

export function ChartCard({ spec, title, caption }: ChartCardProps) {
  const theme = useTheme();
  const normalized = useMemo(() => normalize(spec, theme), [spec, theme]);

  if (!normalized) {
    return (
      <div className="mt-2 rounded-[12px] border border-[color:var(--color-warn-border)] bg-[color:var(--color-warn-surface)] px-3 py-2 text-[12.5px] text-[color:var(--color-warn-text)]">
        Chart data could not be parsed.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-2 overflow-hidden rounded-[12px] border bg-[color:var(--color-surface-raised)]",
        "border-[color:var(--color-border-subtle)]"
      )}
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--color-border-subtle)] px-3 py-2">
        <ChartIcon />
        <span className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
          {title ?? "Chart"}
        </span>
        <span className="ml-auto text-[11px] font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
          Vega-Lite
        </span>
      </div>
      <div className="p-3">
        <VegaEmbed
          spec={normalized}
          options={{ actions: false, renderer: "svg" }}
          className="w-full"
        />
        {caption ? (
          <div className="mt-2 text-[12px] text-[color:var(--color-text-muted)]">{caption}</div>
        ) : null}
      </div>
    </div>
  );
}

function ChartIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[color:var(--color-snow-700)]"
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" />
      <rect x="12" y="8" width="3" height="10" />
      <rect x="17" y="4" width="3" height="14" />
    </svg>
  );
}

/**
 * Vega config that paints the chart with semantic token values so axes,
 * grid lines, and legend text flip with the app theme.
 */
function vegaThemeConfig(theme: Theme): Record<string, unknown> {
  const text =
    theme === "halloween" ? "#FFF4E6" : theme === "dark" ? "#F6F8FB" : "#1A212C";
  const muted =
    theme === "halloween" ? "#B59FBF" : theme === "dark" ? "#99A3B2" : "#6C7786";
  const grid =
    theme === "halloween" ? "#4A2066" : theme === "dark" ? "#2F3744" : "#DBE1EA";
  const halloweenPalette = ["#FF7518", "#FFB380", "#FFC266", "#8CD9A3", "#FF9CB0"];

  const config: Record<string, unknown> = {
    background: "transparent",
    axis: {
      labelColor: muted,
      titleColor: text,
      gridColor: grid,
      domainColor: grid,
      tickColor: grid,
    },
    legend: {
      labelColor: muted,
      titleColor: text,
    },
    title: { color: text },
    view: { stroke: "transparent" },
  };

  if (theme === "halloween") {
    config.range = { category: halloweenPalette };
    config.mark = { color: "#FF7518" };
  }

  return config;
}

/**
 * Normalize whatever the agent emits into a Vega-Lite spec. We handle:
 *   - a complete Vega-Lite JSON object
 *   - a JSON string of the above
 *   - an object with `{ spec: ... }` wrapper
 *
 * Also merges in a theme-aware `config` block for dark-mode legibility.
 */
function normalize(input: unknown, theme: Theme): VisualizationSpec | null {
  if (!input) return null;
  let obj: unknown = input;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || obj === null) return null;
  const maybeWrapped = obj as { spec?: unknown };
  const spec = maybeWrapped.spec ?? obj;
  // Default width to container.
  const asRecord = spec as Record<string, unknown>;
  if (asRecord && typeof asRecord === "object" && !asRecord.width) {
    asRecord.width = "container";
  }
  // Merge theme config without clobbering any spec-provided config.
  const themeConfig = vegaThemeConfig(theme);
  const existingConfig = (asRecord.config as Record<string, unknown>) ?? {};
  asRecord.config = { ...themeConfig, ...existingConfig };
  return asRecord as VisualizationSpec;
}
