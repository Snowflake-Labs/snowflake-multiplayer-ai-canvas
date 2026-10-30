"use client";

import { useState } from "react";
import { BrandLockup } from "./Brand";
import { PresenceStrip } from "./PresenceStrip";
import { Pill } from "./ui/Pill";
import { Button } from "./ui/Button";
import { Share2, RefreshCw, History, Check, Sun, Moon } from "lucide-react";
import { PriorSessionsMenu } from "./PriorSessionsMenu";
import { toggleTheme } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

export type ConnState = "connecting" | "live" | "disconnected";

export function CanvasHeader({
  canvasId,
  me,
  presence,
  conn,
  onNewSession,
  onLoadContext,
}: {
  canvasId: string;
  me: string;
  presence: string[];
  conn: ConnState;
  onNewSession?: () => void;
  onLoadContext?: (threadId: number) => void;
}) {
  const [priorOpen, setPriorOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const theme = useTheme();

  const { tone, label } =
    conn === "live"
      ? { tone: "success" as const, label: "Live" }
      : conn === "connecting"
      ? { tone: "warn" as const, label: "Connecting…" }
      : { tone: "danger" as const, label: "Disconnected" };

  return (
    <header className="sticky top-0 z-10 border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
        <BrandLockup />
        <Pill tone={tone} dot pulsing>
          {label}
        </Pill>
        <div className="ml-auto flex items-center gap-2">
          <PresenceStrip users={presence} me={me} />
          {onLoadContext ? (
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPriorOpen((v) => !v)}
              >
                <History className="h-3.5 w-3.5" />
                Load prior context
              </Button>
              <PriorSessionsMenu
                canvasId={canvasId}
                open={priorOpen}
                onClose={() => setPriorOpen(false)}
                onPick={(threadId) => onLoadContext(threadId)}
              />
            </div>
          ) : null}
          {onNewSession ? (
            <Button variant="secondary" size="sm" onClick={onNewSession}>
              <RefreshCw className="h-3.5 w-3.5" />
              New session
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (typeof window !== "undefined") {
                const url = `${window.location.origin}/canvas/${encodeURIComponent(canvasId)}`;
                const invite = `I'm in an agent canvas on Snowflake. Join me: ${url}`;
                void navigator.clipboard.writeText(invite);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }
            }}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Invite copied
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                Invite others
              </>
            )}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              toggleTheme();
            }}
            aria-label={
              theme === "halloween"
                ? "Exit halloween mode"
                : theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
          >
            {theme === "halloween" ? (
              <span className="text-[14px] leading-none">🎃</span>
            ) : theme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
