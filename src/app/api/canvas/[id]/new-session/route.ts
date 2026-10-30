import { NextRequest, NextResponse } from "next/server";
import { getCallerIdentity } from "@/lib/auth";
import { deleteCanvas } from "@/lib/canvas-store";
import { publish, peekSendLock } from "@/lib/canvas-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/canvas/:id/new-session
 *
 * Starts a fresh session on this canvas. Clears the CANVASES mapping so the
 * next `@Gil` invocation lands on a brand-new Cortex thread. Broadcasts a
 * `session.reset` event so every participant's UI clears live.
 *
 * Blocked while an agent turn is in flight — we don't yank the thread out
 * from under a running turn.
 *
 * Prior filings keep their `thread_id` and remain retrievable via the "Load
 * prior context" flow.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: canvasId } = await params;
  const { user } = getCallerIdentity(req);

  const inflight = peekSendLock(canvasId);
  if (inflight) {
    return NextResponse.json(
      {
        error: "A @Gil turn is in flight. Try again when it finishes.",
        inflight_user: inflight,
      },
      { status: 409 }
    );
  }

  try {
    await deleteCanvas(canvasId);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to clear session: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  publish(canvasId, {
    type: "session.reset",
    canvasId,
    by: user,
    at: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
