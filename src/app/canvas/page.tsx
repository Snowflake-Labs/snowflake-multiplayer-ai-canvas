import { Suspense } from "react";
import ChatClient from "./[id]/ChatClient";

export const dynamic = "force-dynamic";

/**
 * Default canvas at `/canvas`. The dynamic `/canvas/[id]` route stays for
 * named canvases. The canvas identifier here is an implementation detail
 * (the key under which the thread is persisted in CANVASES) and is never
 * surfaced in the URL or the header.
 */
const DEFAULT_CANVAS_ID = "main";

export default function CanvasHome() {
  return (
    <main className="min-h-screen bg-[color:var(--color-surface-base)]">
      <Suspense
        fallback={
          <div className="p-8 text-[color:var(--color-text-muted)]">Loading canvas…</div>
        }
      >
        <ChatClient canvasId={DEFAULT_CANVAS_ID} />
      </Suspense>
    </main>
  );
}
