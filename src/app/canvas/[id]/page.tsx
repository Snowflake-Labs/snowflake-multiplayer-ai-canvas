import { Suspense } from "react";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-[color:var(--color-surface-base)]">
      <Suspense
        fallback={
          <div className="p-8 text-[color:var(--color-text-muted)]">Loading canvas…</div>
        }
      >
        <ChatClient canvasId={id} />
      </Suspense>
    </main>
  );
}
