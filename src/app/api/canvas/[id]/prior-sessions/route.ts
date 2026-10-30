import { NextRequest, NextResponse } from "next/server";
import { getCanvas, listPriorSessions } from "@/lib/canvas-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/canvas/:id/prior-sessions
 *
 * Returns every prior Cortex thread for this canvas that has at least one
 * filing, newest-last-filing first. The current thread (if any) is excluded.
 *
 * Shape per entry:
 *   { thread_id, first_filing, last_filing, n_filings, participants[] }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: canvasId } = await params;

  const currentRow = await getCanvas(canvasId);
  const currentThread = currentRow ? Number(currentRow.THREAD_ID) : null;

  try {
    const rows = await listPriorSessions(canvasId, currentThread);
    const sessions = rows.map((r) => ({
      thread_id: Number(r.THREAD_ID),
      first_filing: r.FIRST_FILING,
      last_filing: r.LAST_FILING,
      n_filings: Number(r.N_FILINGS),
      participants: safeParseArray(r.PARTICIPANTS),
    }));
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to list prior sessions: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}

function safeParseArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
