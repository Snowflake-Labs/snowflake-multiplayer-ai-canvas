import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { callerAgentClient, agentFqn } from "@/lib/agent";
import { getCallerIdentity } from "@/lib/auth";
import { getCanvas, putFiling, getLatestFiling } from "@/lib/canvas-store";
import { publish, presentUsers, flushRoomContext, type RoomLine } from "@/lib/canvas-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/canvas/:id/file
 *
 * Durable, append-only context log. Three invocation shapes, all funneled
 * through this one endpoint:
 *
 *   { text: "...", source: "user" }
 *     - User typed `/file <text>`; store text as-is.
 *
 *   { source: "agent" }
 *     - User clicked "Let Gil write it" (or typed `/file ?`). Run a one-shot
 *       agent turn to summarize the session, then store the agent's reply.
 *
 * The row persists after the canvas instance ends. Future canvas opens can
 * replay these filings as agent context (not implemented in v1).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: canvasId } = await params;
  const { user } = getCallerIdentity(req);

  type FileBody = { text?: string; source?: "user" | "agent" };
  const body = (await req.json().catch(() => ({}))) as FileBody;
  const source = body.source === "agent" ? "agent" : "user";

  // Validate the user-source path
  if (source === "user") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "text required for source=user" }, { status: 400 });
    }
    if (text.length > 10000) {
      return NextResponse.json({ error: "text must be <= 10000 chars" }, { status: 400 });
    }
    body.text = text;
  }

  const row = await getCanvas(canvasId);
  const threadId = row ? Number(row.THREAD_ID) : null;
  const participants = presentUsers(canvasId);

  let context: string;

  if (source === "user") {
    context = body.text!;
  } else {
    // source === "agent": generate a summary via a one-shot sidecar turn.
    try {
      context = await summarizeViaAgent(req, canvasId, threadId);
    } catch (err) {
      return NextResponse.json(
        { error: `Agent-authored filing failed: ${(err as Error).message}` },
        { status: 500 }
      );
    }
  }

  const id = randomUUID();

  try {
    await putFiling({
      id,
      canvasId,
      threadId,
      filedBy: user,
      participants,
      source,
      context,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to persist filing: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  // Publish on the room bus so every connected client renders the FilingCard
  // in the stream, live.
  publish(canvasId, {
    type: "context.filed",
    canvasId,
    by: user,
    payload: { id, source, context, participants, filed_at: Date.now() },
    at: Date.now(),
  });

  return NextResponse.json({ id, context });
}

/**
 * Fire a one-shot agent turn that returns a summary string. Not streamed to
 * the UI — we collect the final text response and return it as the filing.
 *
 * The prompt is tight on scope and length to keep filings scannable. We
 * include a flush of recent room chatter so the agent has something to
 * summarize even when the human talk hasn't involved @Gil this session.
 */
async function summarizeViaAgent(
  req: NextRequest,
  canvasId: string,
  threadId: number | null
): Promise<string> {
  const client = callerAgentClient(req);

  const recent: RoomLine[] = flushRoomContext(canvasId);
  const recentBlock =
    recent.length === 0
      ? "(no recent room chatter captured)"
      : recent.map((l) => `${l.by}: ${l.text}`).join("\n");

  // Scope the summary to the delta since the last filing, if any. On the
  // first filing of the canvas, fall back to a full-session recap.
  const latest = await getLatestFiling(canvasId);

  const prompt = latest
    ? [
        `The most recent filed context on this canvas was at ${latest.FILED_AT}`,
        `by ${latest.FILED_BY} (${latest.SOURCE}-written):`,
        "",
        '"""',
        latest.CONTEXT,
        '"""',
        "",
        "Summarize ONLY what has happened in this canvas since that filing —",
        "new decisions, new learnings, new open threads. Do not repeat anything",
        "from the previous context above. If nothing substantial has changed",
        "since then, say so in one sentence. Keep the response to one short",
        "paragraph (max 500 characters). Do not greet, do not sign off.",
        "",
        "Recent room chatter not yet seen by the agent:",
        recentBlock,
      ].join("\n")
    : [
        "Summarize this canvas session's key decisions, learnings, and open threads",
        "into a single short paragraph (max 500 characters).",
        "Do not greet, do not sign off. Return only the summary, no preamble.",
        "",
        "Recent room chatter not yet seen by the agent:",
        recentBlock,
      ].join("\n");

  const convo = threadId
    ? await client.conversations.attach(String(threadId))
    : await client.conversations.create({
        thread: { origin_application: "canvas-app" },
        agent: { type: "data", spec: agentFqn() },
      });

  const turn = await convo.send(prompt, {
    agent: { type: "data", spec: agentFqn() },
  });

  let summary = "";
  for await (const event of turn.events()) {
    const ev = event as { event?: string; type?: string; text?: string };
    const kind = ev.event ?? ev.type;
    if (kind === "response.text.delta" && typeof ev.text === "string") {
      summary += ev.text;
    }
  }

  summary = summary.trim();
  if (!summary) {
    throw new Error("Agent returned an empty summary");
  }
  if (summary.length > 10000) {
    summary = summary.slice(0, 10000);
  }
  return summary;
}
