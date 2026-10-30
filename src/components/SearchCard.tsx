"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, BookOpen, Globe, ExternalLink, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Pill } from "./ui/Pill";
import { cn } from "@/lib/cn";

export type SearchStatus = "running" | "completed" | "errored";
export type SearchVariant = "docs" | "web";

export interface SearchCitation {
  title?: string;
  url?: string;
  snippet?: string;
}

interface SearchCardProps {
  query?: string;
  status: SearchStatus;
  citations?: SearchCitation[];
  by?: string;
  variant?: SearchVariant;
}

export function SearchCard({ query, status, citations, by, variant = "docs" }: SearchCardProps) {
  const [open, setOpen] = useState(false);
  const count = citations?.length ?? 0;
  const label = variant === "web" ? "Web search" : "Snowflake docs search";
  const Icon = variant === "web" ? Globe : BookOpen;

  return (
    <div
      className={cn(
        "mt-2 overflow-hidden rounded-[12px] border bg-[color:var(--color-surface-raised)]",
        status === "errored"
          ? "border-[color:var(--color-danger-border)]"
          : "border-[color:var(--color-border-subtle)]"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--color-surface-sunken)]"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-[color:var(--color-text-muted)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-[color:var(--color-text-muted)]" />
        )}
        <Icon className="h-3.5 w-3.5 text-[color:var(--color-snow-700)]" />
        <span className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
          {label}
        </span>
        <span className="text-[12px] text-[color:var(--color-text-muted)]">
          {statusCopy(status, count)}
          {by ? ` · for ${by}` : ""}
        </span>
        <span className="ml-auto">
          <StatusPill status={status} />
        </span>
      </button>

      {open ? (
        <div className="border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-overlay)] px-3 py-2.5 text-[12.5px]">
          {query ? (
            <div className="mb-2">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                Query
              </div>
              <div className="rounded-[6px] bg-[color:var(--color-surface-raised)] px-2.5 py-1.5 text-[12.5px] text-[color:var(--color-text-primary)]">
                {query}
              </div>
            </div>
          ) : null}
          {citations && citations.length > 0 ? (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                Sources
              </div>
              <ol className="space-y-1.5">
                {citations.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--color-accent-subtle)] text-[10px] font-semibold text-[color:var(--color-accent-emphasis)]">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[color:var(--color-accent-emphasis)] hover:underline"
                        >
                          {c.title ?? c.url}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="font-medium">{c.title ?? "Source"}</span>
                      )}
                      {c.snippet ? (
                        <div className="line-clamp-2 text-[color:var(--color-text-secondary)]">
                          {c.snippet}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="text-[color:var(--color-text-muted)]">
              {status === "running" ? "Searching documentation…" : "No sources returned."}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: SearchStatus }) {
  if (status === "running") {
    return (
      <Pill tone="accent">
        <Loader2 className="h-3 w-3 animate-spin" />
        Searching
      </Pill>
    );
  }
  if (status === "completed") {
    return (
      <Pill tone="success">
        <CheckCircle2 className="h-3 w-3" />
        Done
      </Pill>
    );
  }
  return (
    <Pill tone="danger">
      <XCircle className="h-3 w-3" />
      Failed
    </Pill>
  );
}

function statusCopy(status: SearchStatus, count: number): string {
  if (status === "running") return "retrieving sources";
  if (status === "completed") return `${count} source${count === 1 ? "" : "s"}`;
  return "search failed";
}
