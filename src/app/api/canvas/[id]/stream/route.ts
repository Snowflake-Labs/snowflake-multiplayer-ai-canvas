import { NextRequest } from "next/server";
import { subscribe, publish, markPresent, markAbsent, presentUsers } from "@/lib/canvas-bus";
import { getCallerIdentity } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/canvas/:id/stream
 *
 * Server-Sent Events stream. Clients subscribe here to receive agent events,
 * user messages, and presence updates for the canvas.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: canvasId } = await ctx.params;
  const identity = getCallerIdentity(req);
  const user = identity.user;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };
      const send = (event: unknown) => {
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
      };

      // 1. tell the client who they are
      send({ type: "presence.you", canvasId, by: user, at: Date.now() });

      // 2. (removed) recent-event replay — caused duplicate turns on SSE
      //    reconnects. For v0.2 the stream is live-only. Chat history on
      //    reload will come from conversation.history() in v0.2.1.

      // 3. mark present + announce
      markPresent(canvasId, user);
      publish(canvasId, { type: "presence.join", canvasId, by: user, at: Date.now() });
      publish(canvasId, {
        type: "presence.state",
        canvasId,
        payload: { users: presentUsers(canvasId) },
        at: Date.now(),
      });

      // 4. subscribe
      const unsubscribe = subscribe(canvasId, (ev) => send(ev));

      // 5. heartbeat (comment line keeps proxy connections alive)
      const heartbeat = setInterval(() => {
        safeEnqueue(`: hb ${Date.now()}\n\n`);
        markPresent(canvasId, user);
      }, 25_000);

      // 6. clean up on abort
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        markAbsent(canvasId, user);
        publish(canvasId, { type: "presence.leave", canvasId, by: user, at: Date.now() });
        publish(canvasId, {
          type: "presence.state",
          canvasId,
          payload: { users: presentUsers(canvasId) },
          at: Date.now(),
        });
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
