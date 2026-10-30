"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, History } from "lucide-react";

export interface PriorSession {
  thread_id: number;
  first_filing: string;
  last_filing: string;
  n_filings: number;
  participants: string[];
}

/**
 * Dropdown popover listing prior Cortex threads on this canvas that have at
 * least one filing. Clicking a row fires onPick(thread_id) and closes.
 */
export function PriorSessionsMenu({
  canvasId,
  open,
  onClose,
  onPick,
  anchorAlign = "right",
}: {
  canvasId: string;
  open: boolean;
  onClose: () => void;
  onPick: (threadId: number) => void;
  anchorAlign?: "left" | "right";
}) {
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<PriorSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/canvas/${encodeURIComponent(canvasId)}/prior-sessions`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          sessions?: PriorSession[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? `Failed (${res.status})`);
          setSessions([]);
        } else {
          setSessions(body.sessions ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, canvasId]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open, onClose]);

  if (!open) return null;

  const positionClass = anchorAlign === "right" ? "right-0" : "left-0";

  return (
    <div
      ref={rootRef}
      className={`absolute top-full z-20 mt-1 w-[360px] overflow-hidden rounded-[12px] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-[var(--shadow-overlay)] ${positionClass}`}
      role="menu"
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--color-border-subtle)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">
        <History className="h-3.5 w-3.5" />
        Prior sessions on this canvas
      </div>
      {loading ? (
        <div className="flex items-center gap-2 px-3 py-4 text-[13px] text-[color:var(--color-text-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="px-3 py-4 text-[13px] text-[color:var(--color-danger-500)]">{error}</div>
      ) : sessions.length === 0 ? (
        <div className="px-3 py-4 text-[13px] text-[color:var(--color-text-muted)]">
          No prior sessions with filings on this canvas yet.
        </div>
      ) : (
        <ul className="max-h-[320px] overflow-y-auto py-1">
          {sessions.map((s) => (
            <li key={s.thread_id}>
              <button
                type="button"
                onClick={() => {
                  onPick(s.thread_id);
                  onClose();
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-[color:var(--color-accent-subtle)]"
              >
                <div className="text-[13px] font-semibold text-[color:var(--color-text-primary)]">
                  Session #{s.thread_id}
                </div>
                <div className="text-[11px] text-[color:var(--color-text-muted)]">
                  {s.n_filings} filing{s.n_filings === 1 ? "" : "s"} · {formatRange(s.first_filing, s.last_filing)}
                </div>
                {s.participants.length > 0 ? (
                  <div className="text-[11px] text-[color:var(--color-text-muted)]">
                    {s.participants.join(", ")}
                  </div>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatRange(first: string, last: string): string {
  // Snowflake TO_VARCHAR default is a stable timestamp string. Trim seconds
  // for brevity in the UI.
  const trim = (s: string) => s.replace(/\.\d+$/, "").replace(/:\d{2}$/, "");
  if (first === last) return trim(first);
  return `${trim(first)} → ${trim(last)}`;
}
