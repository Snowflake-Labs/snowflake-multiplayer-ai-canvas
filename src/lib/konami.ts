// Konami-code easter egg detector.
//
// Listens globally for ↑ ↑ ↓ ↓ ← → ← → B A. Fires the callback when the
// full sequence lands in order. Keys typed inside an input/textarea are
// ignored (so users typing a message don't accidentally trip the egg).

import { useEffect } from "react";

const KONAMI_SEQUENCE: string[] = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return target.isContentEditable;
}

export function useKonami(callback: () => void): void {
  useEffect(() => {
    let idx = 0;
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        idx = 0;
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === KONAMI_SEQUENCE[idx]) {
        idx += 1;
        if (idx === KONAMI_SEQUENCE.length) {
          idx = 0;
          callback();
        }
        return;
      }
      // Allow the current key to restart the sequence if it matches step 0.
      idx = key === KONAMI_SEQUENCE[0] ? 1 : 0;
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [callback]);
}
