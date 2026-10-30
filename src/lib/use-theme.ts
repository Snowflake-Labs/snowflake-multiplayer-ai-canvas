"use client";

// Client-only subscribing hook for the theme state. Separated from theme.ts
// so theme.ts stays React-free and importable by server components.

import { useEffect, useState } from "react";
import { readTheme, type Theme } from "./theme";

export function useTheme(): Theme {
  const [t, setT] = useState<Theme>(() => {
    if (typeof document === "undefined") return "light";
    return readTheme();
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const read = () => setT(readTheme());
    read();
    const obs = new MutationObserver(read);
    obs.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return t;
}
