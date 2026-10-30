"use client";

import { Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "@Gil, net revenue by order year. Chart it.",
  "@Gil, top 5 nations by revenue, as a bar chart.",
  "@Gil, how do Snowflake Dynamic Tables handle incremental refresh?",
  "@Gil, what's new in the latest Snowflake release notes?",
];

export function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl py-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--color-accent-subtle)] text-[color:var(--color-accent-emphasis)]">
        <Sparkles className="h-5 w-5" />
      </div>
      <h1 className="text-[20px] font-semibold tracking-tight text-[color:var(--color-text-primary)]">
        Build together with Gil, in real time.
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--color-text-secondary)]">
        Chat with the room freely. Everyone in this agent canvas shares one Gil agent.
        When you need Gil, mention <span className="font-semibold text-[color:var(--color-accent-emphasis)]">@Gil</span> in your
        message and the agent will join the thread, routing to analysts, docs, charts, web
        search, or a Python sandbox as the question demands. Log important context using
        the <span className="font-semibold text-[color:var(--color-accent-emphasis)]">/file</span> command,
        reuse it in fresh agent sessions by loading prior context.
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-1">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="group rounded-[12px] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-4 py-3 text-left text-[14px] text-[color:var(--color-text-primary)] shadow-[var(--shadow-flat)] transition-colors hover:border-[color:var(--color-accent-surface-border)] hover:bg-[color:var(--color-accent-subtle)]"
          >
            <span className="mr-2 inline-flex rounded-full border border-[color:var(--color-accent-surface-border)] bg-[color:var(--color-accent-subtle)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--color-accent-emphasis)]">
              Try
            </span>
            {q}
          </button>
        ))}
      </div>
      <p className="mt-6 text-[12px] text-[color:var(--color-text-muted)]">
        Queries run under your Snowflake role and warehouse. First send wins while the agent is busy.
      </p>
    </div>
  );
}
