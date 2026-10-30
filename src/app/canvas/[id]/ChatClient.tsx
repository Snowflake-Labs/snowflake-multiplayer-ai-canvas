"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasHeader, type ConnState } from "@/components/CanvasHeader";
import { MessageBubble } from "@/components/MessageBubble";
import { ToolCard, type ToolStatus } from "@/components/ToolCard";
import { SearchCard, type SearchCitation } from "@/components/SearchCard";
import { ChartCard } from "@/components/ChartCard";
import { FilingCard } from "@/components/FilingCard";
import { Composer } from "@/components/Composer";
import { EmptyState } from "@/components/EmptyState";
import { NoticeBanner } from "@/components/NoticeBanner";
import { useKonami } from "@/lib/konami";
import { toggleHalloween } from "@/lib/theme";

interface CanvasEvent {
  type: string;
  canvasId: string;
  by?: string;
  payload?: unknown;
  at: number;
}

type ToolUse =
  | {
      kind: "analyst";
      id: string;
      toolName: string;
      status: ToolStatus;
      input?: unknown;
      sql?: string;
      resultSummary?: string;
    }
  | {
      kind: "search";
      id: string;
      toolName: string;
      status: ToolStatus;
      query?: string;
      citations?: SearchCitation[];
    }
  | {
      kind: "chart";
      id: string;
      toolName: string;
      status: ToolStatus;
      spec?: unknown;
      title?: string;
    };

type Message =
  | {
      kind: "user";
      id: string;
      by: string;
      text: string;
    }
  | {
      kind: "agent";
      id: string;
      by: string;
      text: string;
      streaming: boolean;
      tools: ToolUse[];
    }
  | {
      kind: "system";
      id: string;
      text: string;
    }
  | {
      kind: "filing";
      id: string;
      filedBy: string;
      source: "user" | "agent";
      context: string;
      participants: string[];
      filedAt: number;
    };

interface Notice {
  tone: "info" | "warn" | "danger";
  text: string;
}

export default function ChatClient({ canvasId }: { canvasId: string }) {
  const [me, setMe] = useState<string>("…");
  const [users, setUsers] = useState<string[]>([]);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState<boolean>(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [autofill, setAutofill] = useState<string | undefined>(undefined);
  const [halloweenFlash, setHalloweenFlash] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  // --- Konami easter egg --------------------------------------------------
  const triggerKonami = useCallback(() => {
    const next = toggleHalloween();
    if (next === "halloween") {
      setHalloweenFlash(Date.now());
    }
  }, []);
  useKonami(triggerKonami);

  // --- SSE wiring --------------------------------------------------------
  useEffect(() => {
    const es = new EventSource(`/api/canvas/${encodeURIComponent(canvasId)}/stream`);
    es.onopen = () => setConn("live");
    es.onmessage = (ev) => {
      try {
        handleEvent(JSON.parse(ev.data) as CanvasEvent);
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      // EventSource auto-retries. Flip to "disconnected" so the pill reads
      // red; onopen will flip it back to "live" when the retry lands.
      setConn("disconnected");
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId]);

  const handleEvent = useCallback((e: CanvasEvent) => {
    switch (e.type) {
      case "presence.you":
        setMe(e.by ?? "unknown");
        break;
      case "presence.state":
        setUsers(((e.payload as { users?: string[] })?.users) ?? []);
        break;
      case "presence.join":
        if (e.by) pushSystem(`${e.by} joined the canvas`);
        break;
      case "presence.leave":
        if (e.by) pushSystem(`${e.by} left`);
        break;
      case "session.reset": {
        setMessages([
          {
            kind: "system",
            id: `s-${e.at}-${Math.random()}`,
            text: `New session started by ${e.by ?? "someone"}. Gil's turn-by-turn memory is reset. Filings remain and can be reloaded via Load prior context.`,
          },
        ]);
        break;
      }
      case "system.note": {
        const payload = e.payload as { text?: string };
        if (payload?.text) pushSystem(payload.text);
        break;
      }
      case "user.message": {
        const payload = e.payload as { text: string };
        setMessages((m) => [
          ...m,
          {
            kind: "user",
            id: `u-${e.at}-${e.by ?? "x"}`,
            by: e.by ?? "unknown",
            text: payload.text,
          },
        ]);
        break;
      }
      case "context.filed": {
        const payload = e.payload as {
          id: string;
          source: "user" | "agent";
          context: string;
          participants: string[];
          filed_at: number;
        };
        setMessages((m) => [
          ...m,
          {
            kind: "filing",
            id: payload.id,
            filedBy: e.by ?? "unknown",
            source: payload.source,
            context: payload.context,
            participants: payload.participants ?? [],
            filedAt: payload.filed_at ?? e.at,
          },
        ]);
        break;
      }
      case "agent.event": {
        const ev = e.payload as {
          event?: string;
          type?: string;
          text?: string;
          name?: string;
          input?: unknown;
          tool_use_id?: string;
          content?: unknown;
          tool_type?: string;
          status?: string;
          chart_spec?: string;
          analyst_tool_use_id?: string;
        };
        const kind = ev.event ?? ev.type;

        if (kind === "response.text.delta" && typeof ev.text === "string") {
          appendStreamingText(e.by ?? "assistant", ev.text);
        } else if (kind === "response.tool_use" && typeof ev.name === "string") {
          // Suppress data_to_chart tool_use: the useful payload (spec + data) arrives on
          // response.chart. Rendering here would create a running card we'd then have to
          // dedupe against the chart event.
          if (ev.name === "data_to_chart") break;
          attachToolUse(e.by ?? "assistant", {
            name: ev.name,
            input: ev.input,
            tool_use_id: ev.tool_use_id,
          });
        } else if (kind === "response.chart" && typeof ev.chart_spec === "string") {
          attachChart(e.by ?? "assistant", {
            tool_use_id: ev.tool_use_id,
            chart_spec: ev.chart_spec,
          });
        } else if (kind === "response.tool_result" && typeof ev.tool_use_id === "string") {
          completeToolUse({ tool_use_id: ev.tool_use_id, content: ev.content });
        } else if (
          kind === "response.tool_result.status" &&
          typeof ev.tool_use_id === "string" &&
          ev.status === "executing_tool"
        ) {
          // No-op; the tool_use event delivers the payload for Snowflake's agents.
        }
        break;
      }
      case "turn.done":
        finalizeStreaming();
        setSending(false);
        break;
      case "turn.error": {
        const payload = e.payload as { message?: string };
        setNotice({
          tone: "danger",
          text: `This turn didn't complete: ${payload?.message ?? "unknown error"}. Try again.`,
        });
        finalizeStreaming();
        setSending(false);
        break;
      }
      default:
        break;
    }
  }, []);

  function pushSystem(text: string) {
    setMessages((m) => [...m, { kind: "system", id: `s-${Date.now()}-${Math.random()}`, text }]);
  }

  function appendStreamingText(by: string, delta: string): void {
    setMessages((m) => {
      const id = streamingIdRef.current;
      if (id) {
        return m.map((msg) =>
          msg.kind === "agent" && msg.id === id ? { ...msg, text: msg.text + delta } : msg
        );
      }
      const newId = `a-${Date.now()}`;
      streamingIdRef.current = newId;
      return [
        ...m,
        {
          kind: "agent",
          id: newId,
          by,
          text: delta,
          streaming: true,
          tools: [],
        },
      ];
    });
  }

  function attachToolUse(by: string, tool: { name: string; input?: unknown; tool_use_id?: string }) {
    setMessages((m) => {
      const id = streamingIdRef.current;
      const newTool = buildToolUse(tool);
      if (id) {
        return m.map((msg) =>
          msg.kind === "agent" && msg.id === id
            ? { ...msg, tools: [...msg.tools, newTool] }
            : msg
        );
      }
      const newId = `a-${Date.now()}`;
      streamingIdRef.current = newId;
      return [
        ...m,
        {
          kind: "agent",
          id: newId,
          by,
          text: "",
          streaming: true,
          tools: [newTool],
        },
      ];
    });
  }

  function attachChart(by: string, args: { tool_use_id?: string; chart_spec: string }) {
    const spec = extractChartSpec(args.chart_spec);
    const chartId = args.tool_use_id ?? `chart-${Date.now()}-${Math.random()}`;
    setMessages((m) => {
      const streamingId = streamingIdRef.current;
      let placed = false;
      const next = m.map((msg) => {
        if (msg.kind !== "agent") return msg;
        if (msg.id !== streamingId && streamingId !== null) return msg;
        placed = true;
        return { ...msg, tools: [...msg.tools, buildChartToolUse(chartId, spec)] };
      });
      if (!placed) {
        const newId = `a-${Date.now()}`;
        streamingIdRef.current = newId;
        next.push({
          kind: "agent",
          id: newId,
          by,
          text: "",
          streaming: true,
          tools: [buildChartToolUse(chartId, spec)],
        });
      }
      return next;
    });
  }

  function completeToolUse(tool: { tool_use_id?: string; content?: unknown }) {
    setMessages((m) =>
      m.map((msg) => {
        if (msg.kind !== "agent") return msg;
        return {
          ...msg,
          tools: msg.tools.map((t) =>
            t.id === tool.tool_use_id ? completeTool(t, tool.content) : t
          ),
        };
      })
    );
  }

  function finalizeStreaming() {
    const id = streamingIdRef.current;
    streamingIdRef.current = null;
    if (!id) return;
    setMessages((m) =>
      m.map((msg) =>
        msg.kind === "agent" && msg.id === id
          ? {
              ...msg,
              streaming: false,
              tools: msg.tools.map((t) =>
                t.status === "running" ? { ...t, status: "completed" as ToolStatus } : t
              ),
            }
          : msg
      )
    );
  }

  // --- scroll ------------------------------------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // --- send --------------------------------------------------------------
  const handleSend = useCallback(
    async (text: string) => {
      const invokesAgent = /@gil\b/i.test(text);
      // Only set the busy state when the agent is actually being invoked;
      // room chat should never lock the composer or hide its placeholder.
      if (invokesAgent) setSending(true);
      setNotice(null);
      try {
        const res = await fetch(`/api/canvas/${encodeURIComponent(canvasId)}/send`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.status === 409) {
          const body = await res.json();
          setNotice({
            tone: "warn",
            text: `${body.inflight_user ?? "Someone"} is in the middle of a turn with Gil. First send wins. Try again when they're done.`,
          });
          setAutofill(text);
          setSending(false);
        } else if (!res.ok) {
          setNotice({ tone: "danger", text: `Send failed (${res.status}). Try again.` });
          setAutofill(text);
          setSending(false);
        } else if (!invokesAgent) {
          // Chat-only send: no agent turn, no streaming, so nothing to await.
          setSending(false);
        }
      } catch (err) {
        setNotice({ tone: "danger", text: (err as Error).message });
        setAutofill(text);
        setSending(false);
      }
    },
    [canvasId]
  );

  const handleFile = useCallback(
    async (args: { text?: string; source: "user" | "agent" }) => {
      setNotice(null);
      try {
        const res = await fetch(`/api/canvas/${encodeURIComponent(canvasId)}/file`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setNotice({
            tone: "danger",
            text: `Filing failed${body.error ? `: ${body.error}` : ` (${res.status})`}.`,
          });
        }
      } catch (err) {
        setNotice({ tone: "danger", text: (err as Error).message });
      }
    },
    [canvasId]
  );

  const handleNewSession = useCallback(async () => {
    setNotice(null);
    try {
      const res = await fetch(`/api/canvas/${encodeURIComponent(canvasId)}/new-session`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice({
          tone: res.status === 409 ? "warn" : "danger",
          text: body.error ?? `New session failed (${res.status}).`,
        });
      }
    } catch (err) {
      setNotice({ tone: "danger", text: (err as Error).message });
    }
  }, [canvasId]);

  const handleLoadContext = useCallback(
    async (threadId: number) => {
      setNotice(null);
      try {
        const res = await fetch(
          `/api/canvas/${encodeURIComponent(canvasId)}/load-context`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ thread_id: threadId }),
          }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setNotice({
            tone: res.status === 409 ? "warn" : "danger",
            text: body.error ?? `Load context failed (${res.status}).`,
          });
        }
      } catch (err) {
        setNotice({ tone: "danger", text: (err as Error).message });
      }
    },
    [canvasId]
  );

  // --- render ------------------------------------------------------------
  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen flex-col bg-[color:var(--color-surface-base)]">
      {halloweenFlash !== null ? (
        <span
          key={halloweenFlash}
          className="canvas-halloween-flash"
          aria-hidden="true"
          onAnimationEnd={() => setHalloweenFlash(null)}
        >
          🎃
        </span>
      ) : null}
      <CanvasHeader
        canvasId={canvasId}
        me={me}
        presence={users}
        conn={conn}
        onNewSession={handleNewSession}
        onLoadContext={handleLoadContext}
      />

      <div ref={scrollRef} className="scroll-pane flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6">
          {notice ? (
            <NoticeBanner tone={notice.tone} onDismiss={() => setNotice(null)}>
              {notice.text}
            </NoticeBanner>
          ) : null}

          {isEmpty ? (
            <EmptyState onPick={handleSend} />
          ) : (
            <div className="pb-6">
              {messages.map((m) => {
                if (m.kind === "system") {
                  return <MessageBubble key={m.id} role="system" author="" text={m.text} />;
                }
                if (m.kind === "user") {
                  return <MessageBubble key={m.id} role="user" author={m.by} text={m.text} />;
                }
                if (m.kind === "filing") {
                  return (
                    <FilingCard
                      key={m.id}
                      filedBy={m.filedBy}
                      source={m.source}
                      context={m.context}
                      participants={m.participants}
                      filedAt={m.filedAt}
                    />
                  );
                }
                return (
                  <MessageBubble
                    key={m.id}
                    role="agent"
                    author={m.by}
                    text={m.text}
                    streaming={m.streaming}
                  >
                    {m.tools.map((t) => {
                      if (t.kind === "search") {
                        return (
                          <SearchCard
                            key={t.id}
                            query={t.query}
                            status={t.status}
                            citations={t.citations}
                            by={m.by}
                            variant={t.toolName === "web_search" ? "web" : "docs"}
                          />
                        );
                      }
                      if (t.kind === "chart") {
                        if (t.status === "completed" && t.spec) {
                          return <ChartCard key={t.id} spec={t.spec} title={t.title} />;
                        }
                        return (
                          <ToolCard
                            key={t.id}
                            toolName="Chart"
                            friendlyName="Chart"
                            status={t.status}
                            by={m.by}
                          />
                        );
                      }
                      return (
                        <ToolCard
                          key={t.id}
                          toolName={t.toolName}
                          status={t.status}
                          input={t.input}
                          sql={t.sql}
                          resultSummary={t.resultSummary}
                          by={m.by}
                        />
                      );
                    })}
                  </MessageBubble>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Composer
        onSend={handleSend}
        onFile={handleFile}
        busy={sending}
        autofillValue={autofill}
        onAutofillConsumed={() => setAutofill(undefined)}
      />
    </div>
  );
}

function summarize(content: unknown): string | undefined {
  if (!content) return undefined;
  if (typeof content === "string") return content.length > 200 ? `${content.slice(0, 200)}…` : content;
  try {
    const s = JSON.stringify(content);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return "Result received.";
  }
}

function classify(name: string): "analyst" | "search" | "chart" {
  const n = name.toLowerCase();
  if (n.includes("chart")) return "chart";
  if (n.includes("search")) return "search";
  return "analyst";
}

function buildToolUse(tool: { name: string; input?: unknown; tool_use_id?: string }): ToolUse {
  const id = tool.tool_use_id ?? `tool-${Date.now()}-${Math.random()}`;
  const kind = classify(tool.name);
  if (kind === "search") {
    return {
      kind: "search",
      id,
      toolName: tool.name,
      status: "running",
      query: readQuery(tool.input),
    };
  }
  if (kind === "chart") {
    const spec = extractChartSpec(readChartInput(tool.input));
    return {
      kind: "chart",
      id,
      toolName: tool.name,
      status: spec ? "completed" : "running",
      spec,
      title: "Chart",
    };
  }
  return {
    kind: "analyst",
    id,
    toolName: tool.name,
    status: "running",
    input: tool.input,
  };
}

function buildChartToolUse(id: string, spec: unknown): ToolUse {
  return {
    kind: "chart",
    id,
    toolName: "chart",
    status: spec ? "completed" : "running",
    spec,
    title: "Chart",
  };
}

function completeTool(prev: ToolUse, content: unknown): ToolUse {
  if (prev.kind === "search") {
    return {
      ...prev,
      status: "completed",
      citations: extractCitations(content) ?? prev.citations,
    };
  }
  if (prev.kind === "chart") {
    return {
      ...prev,
      status: "completed",
      spec: extractChartSpec(content) ?? prev.spec,
    };
  }
  return {
    ...prev,
    status: "completed",
    resultSummary: summarize(content),
  };
}

function readQuery(input: unknown): string | undefined {
  if (!input) return undefined;
  if (typeof input === "string") return input;
  if (typeof input === "object") {
    const asRecord = input as Record<string, unknown>;
    const v = asRecord.query ?? asRecord.question ?? asRecord.text;
    if (typeof v === "string") return v;
  }
  return undefined;
}

/**
 * Snowflake's data_to_chart tool_use carries the Vega-Lite spec as a JSON string
 * in input.chart. Older/alt shape: input.query. Fall back to the whole input.
 */
function readChartInput(input: unknown): unknown {
  if (!input) return undefined;
  if (typeof input === "object") {
    const rec = input as Record<string, unknown>;
    return rec.chart ?? rec.spec ?? rec.query ?? input;
  }
  return input;
}

function extractCitations(content: unknown): SearchCitation[] | undefined {
  if (!content) return undefined;
  const asArray = Array.isArray(content) ? content : (content as { results?: unknown[] }).results;
  if (!Array.isArray(asArray)) return undefined;
  return asArray.slice(0, 8).map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      title: (rec.title ?? rec.DOCUMENT_TITLE ?? rec.document_title) as string | undefined,
      url: (rec.url ?? rec.SOURCE_URL ?? rec.source_url) as string | undefined,
      snippet: (rec.snippet ?? rec.chunk ?? rec.CHUNK) as string | undefined,
    };
  });
}

function extractChartSpec(content: unknown): unknown | undefined {
  if (!content) return undefined;
  // Common shapes: a string JSON, { spec: ... }, { chart: ... }, or the spec itself.
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      return undefined;
    }
  }
  if (typeof content === "object") {
    const rec = content as Record<string, unknown>;
    return rec.spec ?? rec.chart ?? rec.vega_lite ?? content;
  }
  return content;
}
