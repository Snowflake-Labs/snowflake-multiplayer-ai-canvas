import { Paperclip } from "lucide-react";
import { Pill } from "./ui/Pill";

interface FilingCardProps {
  filedBy: string;
  source: "user" | "agent";
  context: string;
  participants?: string[];
  filedAt?: number;
}

/**
 * Visual card for a /file submission. Distinct from chat bubbles and tool
 * cards so filings are scannable in the stream.
 */
export function FilingCard({ filedBy, source, context, participants, filedAt }: FilingCardProps) {
  const label = source === "agent" ? "Agent-written" : "User-written";
  const tone = source === "agent" ? "accent" : "neutral";
  const when = filedAt ? new Date(filedAt).toLocaleTimeString() : null;

  return (
    <div className="my-3 rounded-[12px] border border-[color:var(--color-accent-surface-border)] bg-[color:var(--color-accent-subtle)] p-4 shadow-[var(--shadow-flat)]">
      <div className="mb-2 flex items-center gap-2">
        <Paperclip className="h-3.5 w-3.5 text-[color:var(--color-snow-700)]" />
        <span className="text-[12px] font-semibold text-[color:var(--color-text-primary)]">
          {filedBy} filed context
        </span>
        <Pill tone={tone}>{label}</Pill>
        {when ? (
          <span className="ml-auto text-[11px] text-[color:var(--color-text-muted)]">{when}</span>
        ) : null}
      </div>
      <div className="rounded-[8px] bg-[color:var(--color-surface-raised)] px-3 py-2 text-[13px] leading-relaxed text-[color:var(--color-text-primary)]">
        {context}
      </div>
      {participants && participants.length > 0 ? (
        <div className="mt-2 text-[11px] text-[color:var(--color-text-muted)]">
          Participants at filing: {participants.join(", ")}
        </div>
      ) : null}
    </div>
  );
}
