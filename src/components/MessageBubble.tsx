import { Avatar } from "./ui/Avatar";
import { Markdown } from "./Markdown";
import { cn } from "@/lib/cn";

export type BubbleRole = "user" | "agent" | "system";

interface MessageBubbleProps {
  role: BubbleRole;
  author: string;
  text: string;
  streaming?: boolean;
  children?: React.ReactNode;
}

export function MessageBubble({ role, author, text, streaming, children }: MessageBubbleProps) {
  const isAgent = role === "agent";
  const isSystem = role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="rounded-full border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-1 text-[12px] text-[color:var(--color-text-muted)]">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 py-3">
      <div className="pt-0.5">
        <Avatar
          name={author}
          variant={isAgent ? "agent" : "person"}
          size={30}
          title={author}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-[color:var(--color-text-primary)]">
            {isAgent ? "Gil" : author}
          </span>
          {isAgent ? (
            <span className="text-[11px] text-[color:var(--color-text-muted)]">
              shared Snowflake agent
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "rounded-[12px] border px-3.5 py-2.5",
            isAgent
              ? "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]"
              : "border-[color:var(--color-accent-surface-border)] bg-[color:var(--color-accent-subtle)]"
          )}
        >
          {isAgent ? (
            <>
              {text ? <Markdown>{text}</Markdown> : null}
              {streaming && !text ? (
                <div className="flex items-center gap-1.5 text-[13px] text-[color:var(--color-text-muted)]">
                  <span>Thinking</span>
                  <span className="canvas-stream-cursor" />
                </div>
              ) : null}
              {streaming && text ? <span className="canvas-stream-cursor" /> : null}
              {children}
            </>
          ) : (
            <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-[color:var(--color-text-primary)]">
              {renderUserText(text)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Lightly highlight @Gil (any case) in user messages so a reader can scan
 * the thread and spot which lines invoked the agent.
 */
function renderUserText(text: string): React.ReactNode {
  const parts = text.split(/(@gil\b)/gi);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    /^@gil$/i.test(part) ? (
      <span key={i} className="font-semibold text-[color:var(--color-accent-emphasis)]">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
