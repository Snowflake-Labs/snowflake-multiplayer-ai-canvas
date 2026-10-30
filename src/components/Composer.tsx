"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { ArrowUp, Loader2, Paperclip, Sparkles, X } from "lucide-react";
import { Avatar } from "./ui/Avatar";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/use-theme";

interface ComposerProps {
  onSend: (text: string) => Promise<void> | void;
  onFile?: (args: { text?: string; source: "user" | "agent" }) => Promise<void> | void;
  disabled?: boolean;
  busy?: boolean;
  pendingNotice?: string;
  autofillValue?: string;
  onAutofillConsumed?: () => void;
}

interface MentionCandidate {
  key: string;      // literal insertion label (becomes `@${key} `)
  display: string;  // display name shown in the menu
  subtitle: string;
  variant: "agent" | "person";
}

const MENTION_CANDIDATES: MentionCandidate[] = [
  { key: "Gil", display: "Gil", subtitle: "shared Snowflake agent", variant: "agent" },
];

interface MentionState {
  start: number;  // index of the `@` in the textarea value
  query: string;  // characters typed after `@`, verbatim
}

export function Composer({
  onSend,
  onFile,
  disabled,
  busy,
  pendingNotice,
  autofillValue,
  onAutofillConsumed,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [mention, setMention] = useState<MentionState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [fileSheet, setFileSheet] = useState<null | "open" | "submitting">(null);
  const [fileSheetText, setFileSheetText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const theme = useTheme();

  useEffect(() => {
    if (autofillValue && !value) {
      setValue(autofillValue);
      onAutofillConsumed?.();
      taRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofillValue]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [value]);

  const filtered = mention ? filterCandidates(mention.query) : [];
  const menuOpen = mention !== null && filtered.length > 0;

  // Clamp the highlighted index whenever the candidate list changes.
  useEffect(() => {
    if (menuOpen && mentionIndex >= filtered.length) setMentionIndex(0);
  }, [menuOpen, mentionIndex, filtered.length]);

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (menuOpen) return; // defensive: menu-open Enter was already intercepted
    const text = value.trim();
    if (!text || disabled || busy) return;

    // Slash-command: /file  -> capture context into the durable log
    if (text === "/file" || text.startsWith("/file ")) {
      const rest = text === "/file" ? "" : text.slice("/file ".length).trim();
      if (!onFile) return; // no handler wired; ignore the command
      setValue("");
      setMention(null);
      if (rest.length > 0) {
        // User already provided the context inline; file it immediately.
        await onFile({ text: rest, source: "user" });
      } else {
        // Bare /file -> open the sheet so the user can pick between
        // "write it myself" and "let Gil write it."
        setFileSheetText("");
        setFileSheet("open");
      }
      return;
    }

    setValue("");
    setMention(null);
    await onSend(text);
  }

  async function submitFileSheet(args: { text?: string; source: "user" | "agent" }) {
    if (!onFile) return;
    setFileSheet("submitting");
    try {
      await onFile(args);
    } finally {
      setFileSheet(null);
      setFileSheetText("");
    }
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    const caret = e.target.selectionStart ?? next.length;
    setMention(detectMention(next, caret));
    setMentionIndex(0);
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // IME composition: don't swallow keys while composing.
    if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return;

    if (menuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        acceptMention(filtered[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  function acceptMention(candidate: MentionCandidate) {
    const ta = taRef.current;
    if (!mention || !ta) return;
    const caret = ta.selectionStart ?? value.length;
    const applied = applyMention(value, mention.start, caret, `@${candidate.key} `);
    setValue(applied.value);
    setMention(null);
    setMentionIndex(0);
    // Restore the caret position after React commits the new value.
    queueMicrotask(() => {
      const t = taRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(applied.caretAt, applied.caretAt);
    });
  }

  function handleBlur() {
    // Delay the close so a click on a menu item has time to run.
    setTimeout(() => setMention(null), 100);
  }

  const canSend = value.trim().length > 0 && !disabled && !busy;
  const count = value.length;

  return (
    <div className="sticky bottom-0 border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-base)]/95 backdrop-blur">
      <div className="mx-auto max-w-5xl px-6 py-3">
        {pendingNotice ? (
          <div className="mb-2 text-[12px] text-[color:var(--color-text-muted)]">
            {pendingNotice}
          </div>
        ) : null}
        {fileSheet !== null ? (
          <FileSheet
            text={fileSheetText}
            onTextChange={setFileSheetText}
            submitting={fileSheet === "submitting"}
            onCancel={() => {
              setFileSheet(null);
              setFileSheetText("");
            }}
            onSubmitUser={() => submitFileSheet({ text: fileSheetText.trim(), source: "user" })}
            onSubmitAgent={() => submitFileSheet({ source: "agent" })}
          />
        ) : null}
        <div className="relative">
          {menuOpen ? (
            <MentionMenu
              candidates={filtered}
              highlighted={mentionIndex}
              onPick={acceptMention}
              onHoverIndex={setMentionIndex}
            />
          ) : null}
          <form
            onSubmit={handleSubmit}
            className={cn(
              "flex items-end gap-2 rounded-[14px] border bg-[color:var(--color-surface-raised)] p-2 shadow-[var(--shadow-raised)] transition-colors",
              "border-[color:var(--color-border-subtle)] focus-within:border-[color:var(--color-snow-400)]"
            )}
          >
            <textarea
              ref={taRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKey}
              onBlur={handleBlur}
              onSelect={(e) => {
                const ta = e.currentTarget;
                setMention(detectMention(ta.value, ta.selectionStart ?? 0));
              }}
              disabled={disabled}
              rows={1}
              placeholder={
                busy
                  ? "Gil is responding. Your @Gil message will send when it's done…"
                  : theme === "halloween"
                  ? "Boo! Chat with the room, or summon @Gil…"
                  : "Chat with the room, or type @Gil to invoke the agent…"
              }
              className="min-h-[36px] max-h-[180px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[14.5px] leading-6 text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-muted)] focus:outline-none"
            />
            <div className="flex items-center gap-2 pr-1 pb-1">
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  count > 1500
                    ? "text-[color:var(--color-warn-500)]"
                    : "text-[color:var(--color-text-muted)]"
                )}
              >
                {count > 0 ? count : ""}
              </span>
              <button
                type="submit"
                disabled={!canSend}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-snow-400)]",
                  canSend
                    ? "bg-[color:var(--color-accent)] text-[color:var(--color-accent-fg)] hover:bg-[color:var(--color-accent-hover)]"
                    : "bg-[color:var(--color-ink-200)] text-[color:var(--color-ink-500)]"
                )}
                aria-label="Send message"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </form>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-[color:var(--color-text-muted)]">
          <span>Enter to send · Shift + Enter for a newline · @Gil to invoke the agent · /file to log context</span>
          <span>Gil streams to everyone in this canvas</span>
        </div>
      </div>
    </div>
  );
}

// --- Mention menu ---------------------------------------------------------

function MentionMenu({
  candidates,
  highlighted,
  onPick,
  onHoverIndex,
}: {
  candidates: MentionCandidate[];
  highlighted: number;
  onPick: (c: MentionCandidate) => void;
  onHoverIndex: (i: number) => void;
}) {
  return (
    <div
      className="absolute left-2 bottom-full mb-2 w-[260px] overflow-hidden rounded-[12px] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-[var(--shadow-overlay)]"
      role="listbox"
      aria-label="Mention candidates"
    >
      <div className="border-b border-[color:var(--color-border-subtle)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">
        Mention
      </div>
      <ul className="py-1">
        {candidates.map((c, i) => {
          const active = i === highlighted;
          return (
            <li key={c.key}>
              <button
                type="button"
                // Use onMouseDown so the click fires before the textarea's onBlur
                // closes the menu via setTimeout.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(c);
                }}
                onMouseEnter={() => onHoverIndex(i)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                  active
                    ? "bg-[color:var(--color-accent-subtle)]"
                    : "hover:bg-[color:var(--color-surface-sunken)]"
                )}
                role="option"
                aria-selected={active}
              >
                <Avatar name={c.display} variant={c.variant} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[color:var(--color-text-primary)]">
                    {c.display}
                  </div>
                  <div className="text-[11px] text-[color:var(--color-text-muted)]">
                    {c.subtitle}
                  </div>
                </div>
                <span className="rounded border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-base)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                  {active ? "Enter" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Pure helpers ---------------------------------------------------------

/**
 * Scan backwards from the caret for an active mention token: `@` followed by
 * zero or more non-whitespace / non-punctuation characters. The character
 * immediately before `@` must be absent or whitespace/punctuation, so
 * `user@domain` does not trigger the menu.
 */
function detectMention(value: string, caretAt: number): MentionState | null {
  if (caretAt <= 0 || caretAt > value.length) return null;
  // Walk backwards collecting the query, stop at `@` or at an invalid char.
  let i = caretAt - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === "@") {
      const prev = i > 0 ? value[i - 1] : "";
      const prevOk = i === 0 || /\s|[(,.;:!?]/.test(prev);
      if (!prevOk) return null;
      const query = value.slice(i + 1, caretAt);
      return { start: i, query };
    }
    // Any whitespace or newline terminates a mention token.
    if (/\s/.test(ch)) return null;
    i -= 1;
  }
  return null;
}

function filterCandidates(query: string): MentionCandidate[] {
  const q = query.toLowerCase();
  return MENTION_CANDIDATES.filter((c) => c.key.toLowerCase().startsWith(q));
}

function applyMention(
  value: string,
  mentionStart: number,
  caretAt: number,
  insertion: string
): { value: string; caretAt: number } {
  const before = value.slice(0, mentionStart);
  const after = value.slice(caretAt);
  // Avoid double spaces if the next char is already whitespace.
  const insert = after.startsWith(" ") ? insertion.trimEnd() : insertion;
  return {
    value: before + insert + after,
    caretAt: mentionStart + insert.length,
  };
}

// --- /file sheet ----------------------------------------------------------

function FileSheet({
  text,
  onTextChange,
  submitting,
  onCancel,
  onSubmitUser,
  onSubmitAgent,
}: {
  text: string;
  onTextChange: (v: string) => void;
  submitting: boolean;
  onCancel: () => void;
  onSubmitUser: () => Promise<void> | void;
  onSubmitAgent: () => Promise<void> | void;
}) {
  const canSubmitUser = text.trim().length > 0 && !submitting;
  return (
    <div className="mb-2 rounded-[12px] border border-[color:var(--color-accent-surface-border)] bg-[color:var(--color-accent-subtle)] p-3 shadow-[var(--shadow-flat)]">
      <div className="mb-2 flex items-center gap-2">
        <Paperclip className="h-3.5 w-3.5 text-[color:var(--color-snow-700)]" />
        <span className="text-[13px] font-semibold text-[color:var(--color-text-primary)]">
          File context from this session
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-[6px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-raised)] hover:text-[color:var(--color-text-primary)] disabled:opacity-50"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        disabled={submitting}
        rows={3}
        placeholder="Type the context you want to save. Or skip this and let Gil write a summary."
        className="min-h-[72px] w-full resize-none rounded-[8px] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-2 text-[13px] leading-relaxed text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-muted)] focus:border-[color:var(--color-snow-400)] focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onSubmitAgent}
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-[8px] border border-[color:var(--color-accent-surface-border)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--color-accent-emphasis)] hover:bg-[color:var(--color-accent-subtle)] disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Let Gil write it
        </button>
        <button
          type="button"
          onClick={onSubmitUser}
          disabled={!canSubmitUser}
          className={cn(
            "rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors",
            canSubmitUser
              ? "bg-[color:var(--color-accent)] text-[color:var(--color-accent-fg)] hover:bg-[color:var(--color-accent-hover)]"
              : "bg-[color:var(--color-ink-200)] text-[color:var(--color-ink-500)]"
          )}
        >
          Save my text
        </button>
      </div>
    </div>
  );
}
