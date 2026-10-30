import { NextRequest, NextResponse } from "next/server";
import { callerAgentClient, agentFqn } from "@/lib/agent";
import { getCallerIdentity } from "@/lib/auth";
import {
  getCanvas,
  putCanvas,
  deleteCanvas,
  listFilingsByThread,
  type FilingRecord,
} from "@/lib/canvas-store";
import {
  acquireSendLock,
  releaseSendLock,
  peekSendLock,
  publish,
} from "@/lib/canvas-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/canvas/:id/load-context
 * Body: { thread_id: number }
 *
 * Fetch all filings tied to the given prior thread, build a brief, and run
 * an agent turn automatically so the summary materializes in the current
 * session's stream. The user does not have to click send.
 *
 * The prompt is also broadcast as a visible user.message so every participant
 * sees exactly what triggered Gil's summary.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: canvasId } = await params;
  const { user } = getCallerIdentity(req);

  type Body = { thread_id?: number };
  const body = (await req.json().catch(() => ({}))) as Body;
  const threadIdNum = typeof body.thread_id === "number" ? body.thread_id : NaN;
  if (!Number.isFinite(threadIdNum)) {
    return NextResponse.json({ error: "thread_id required" }, { status: 400 });
  }

  let filings: FilingRecord[];
  try {
    filings = await listFilingsByThread(threadIdNum);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch filings: ${(err as Error).message}` },
      { status: 500 }
    );
  }
  if (filings.length === 0) {
    return NextResponse.json(
      { error: "No filings for that session." },
      { status: 400 }
    );
  }

  const lock = acquireSendLock(canvasId, user);
  if (!lock) {
    const current = peekSendLock(canvasId);
    return NextResponse.json(
      {
        code: "turn_in_flight",
        inflight_user: current?.user,
      },
      { status: 409 }
    );
  }

  const prompt = buildLoadPrompt(threadIdNum, filings);
  const at = Date.now();

  // Publish a compact system note so the stream stays scannable. The agent
  // sees the full prompt internally; participants only see the one-liner.
  publish(canvasId, {
    type: "system.note",
    canvasId,
    by: user,
    payload: {
      text: `${user} loaded context from Session #${threadIdNum} (${filings.length} filing${filings.length === 1 ? "" : "s"}). Gil is drafting a brief…`,
    },
    at,
  });

  void runLoadTurn({ canvasId, user, prompt, req }).finally(() => {
    releaseSendLock(canvasId);
  });

  return NextResponse.json(
    { accepted: true, filings_count: filings.length },
    { status: 202 }
  );
}

function buildLoadPrompt(threadId: number, filings: FilingRecord[]): string {
  const lines = filings
    .map(
      (f) => `${f.FILED_AT} | ${f.FILED_BY} | ${f.SOURCE} | ${f.CONTEXT}`
    )
    .join("\n");

  return [
    "Review these filings from a prior session on this canvas (thread " +
      String(threadId) +
      ") and summarize the key decisions, learnings, and open threads so the",
    "team can resume. Keep it to one short paragraph. End with a one-line",
    '"Open questions" list if any.',
    "",
    "Filings (oldest first):",
    lines,
  ].join("\n");
}

async function runLoadTurn(args: {
  canvasId: string;
  user: string;
  prompt: string;
  req: NextRequest;
}): Promise<void> {
  const { canvasId, user, prompt, req } = args;
  const client = callerAgentClient(req);

  try {
    let row = await getCanvas(canvasId);
    let threadId: number;

    const createFreshThread = async () => {
      const convo = await client.conversations.create({
        thread: { origin_application: "canvas-app" },
        agent: { type: "data", spec: agentFqn() },
      });
      threadId = Number(convo.id);
      await putCanvas({ canvasId, threadId, createdBy: user });
      row = {
        CANVAS_ID: canvasId,
        THREAD_ID: threadId,
        DISPLAY_NAME: null,
        CREATED_BY: user,
        CREATED_AT: "",
      };
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
        console.warn("[load-context] attach failed, creating fresh thread", {
          canvasId,
          threadId,
          message: (attachErr as Error).message,
        });
        await deleteCanvas(canvasId);
        convo = await createFreshThread();
      }
    }

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
    console.error("[load-context] turn error", {
      canvasId,
      user,
      message: e.message,
    });
    publish(canvasId, {
      type: "turn.error",
      canvasId,
      by: user,
      payload: { message: "Gil hit an error loading prior context. Try again, or start a fresh session." },
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
