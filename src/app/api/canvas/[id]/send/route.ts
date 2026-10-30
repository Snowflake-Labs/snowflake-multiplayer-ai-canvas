import { NextRequest, NextResponse } from "next/server";
import { callerAgentClient, agentFqn } from "@/lib/agent";
import { getCallerIdentity } from "@/lib/auth";
import { getCanvas, putCanvas, deleteCanvas } from "@/lib/canvas-store";
import {
  acquireSendLock,
  releaseSendLock,
  peekSendLock,
  publish,
  appendRoomLine,
  flushRoomContext,
  type RoomLine,
} from "@/lib/canvas-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The canvas uses @Gil (any case) as the invocation marker. Non-mention
 * messages are chat between humans and never trigger an agent turn.
 */
const AGENT_MENTION = /@gil\b/i;

/**
 * POST /api/canvas/:id/send
 *
 * Body: { text: string }
 *
 * Flow:
 *   1. Resolve caller identity, parse body.
 *   2. If the message does NOT mention @Gil: publish user.message, append
 *      to the in-memory room-context buffer, return 200 "chat_only". No lock.
 *   3. If the message mentions @Gil:
 *      a. Acquire first-send-wins lock (409 if a turn is in flight).
 *      b. Publish user.message.
 *      c. Flush the room-context buffer and build a composite agent prompt
 *         that includes the recent chat for context.
 *      d. Resolve canvas → thread_id, open conversation, stream SSE events.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: canvasId } = await ctx.params;
  const identity = getCallerIdentity(req);
  const user = identity.user;

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "empty_text" }, { status: 400 });

  const invokesAgent = AGENT_MENTION.test(text);
  const at = Date.now();

  // Every message is broadcast to every subscriber.
  publish(canvasId, {
    type: "user.message",
    canvasId,
    by: user,
    payload: { text, mentionsAgent: invokesAgent },
    at,
  });

  if (!invokesAgent) {
    appendRoomLine(canvasId, { by: user, text, at });
    return NextResponse.json({ accepted: true, kind: "chat_only" }, { status: 200 });
  }

  // Agent invocation path.
  const lock = acquireSendLock(canvasId, user);
  if (!lock) {
    const current = peekSendLock(canvasId);
    return NextResponse.json(
      {
        code: "turn_in_flight",
        inflight_user: current?.user,
        inflight_started_at: current?.startedAt,
      },
      { status: 409 }
    );
  }

  const roomLines = flushRoomContext(canvasId);
  const agentPrompt = buildAgentPrompt({ roomLines, user, text });

  void runTurn({ canvasId, user, prompt: agentPrompt, req }).finally(() => {
    releaseSendLock(canvasId);
  });

  return NextResponse.json(
    { accepted: true, kind: "agent_turn", context_lines: roomLines.length },
    { status: 202 }
  );
}

function buildAgentPrompt(args: {
  roomLines: RoomLine[];
  user: string;
  text: string;
}): string {
  const { roomLines, user, text } = args;
  if (roomLines.length === 0) {
    return `[${user} mentioning @Gil]: ${text}`;
  }
  const transcript = roomLines
    .map((l) => `${l.by}: ${l.text}`)
    .join("\n");
  return [
    "[Recent room transcript, not addressed to you]",
    transcript,
    "",
    `[${user} is now mentioning @Gil]`,
    text,
  ].join("\n");
}

async function runTurn(args: {
  canvasId: string;
  user: string;
  prompt: string;
  req: NextRequest;
}): Promise<void> {
  const { canvasId, user, prompt, req } = args;

  const client = callerAgentClient(req);

  try {
    console.log("[send] start", { canvasId, user, promptLen: prompt.length });

    let row = await getCanvas(canvasId);
    let threadId: number;

    const createFreshThread = async () => {
      const convo = await client.conversations.create({
        thread: { origin_application: "canvas-app" },
        agent: { type: "data", spec: agentFqn() },
      });
      threadId = Number(convo.id);
      await putCanvas({ canvasId, threadId, createdBy: user });
      row = { CANVAS_ID: canvasId, THREAD_ID: threadId, DISPLAY_NAME: null, CREATED_BY: user, CREATED_AT: "" };
      return convo;
    };

    let convo;
    if (!row) {
      convo = await createFreshThread();
    } else {
      threadId = Number(row.THREAD_ID);
      try {
        convo = await client.conversations.attach(String(threadId));
      } catch (attachErr) {
        console.warn("[send] attach failed, creating fresh thread", {
          canvasId,
          threadId,
          message: (attachErr as Error).message,
        });
        await deleteCanvas(canvasId);
        convo = await createFreshThread();
      }
    }

    // Prefix the prompt with a [canvas: <id>] tag so the agent can pass the
    // canvas id to tools that need it (e.g., get_filings). The orchestration
    // instruction teaches the agent to parse this line.
    const taggedPrompt = `[canvas: ${canvasId}]\n\n${prompt}`;
    const turn = await convo.send(taggedPrompt, {
      agent: { type: "data", spec: agentFqn() },
    });

    for await (const event of turn.events()) {
      publish(canvasId, {
        type: "agent.event",
        canvasId,
        by: user,
        payload: event,
        at: Date.now(),
      });
    }
  } catch (err) {
    const e = err as Error & { cause?: unknown; code?: string };
    console.error("[send] turn error", {
      canvasId,
      user,
      message: e.message,
      code: e.code,
      cause: e.cause,
      stack: e.stack,
    });
    publish(canvasId, {
      type: "turn.error",
      canvasId,
      by: user,
      payload: { message: "Gil hit an error on this turn. Try again, or ask a teammate to retry." },
      at: Date.now(),
    });
  } finally {
    publish(canvasId, {
      type: "turn.done",
      canvasId,
      by: user,
      at: Date.now(),
    });
  }
}
