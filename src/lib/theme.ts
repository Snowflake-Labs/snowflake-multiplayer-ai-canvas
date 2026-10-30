// Lightweight theme helper. State lives on <html data-theme>; CSS variables
// cascade from there. No React context needed.
//
// Three themes: light, dark, and halloween (hidden easter egg). The user
// toggles light<->dark via the header button; halloween is reached only via
// the konami sequence (see konami.ts).
//
// This module is intentionally React-free so it can be imported from server
// components (e.g. layout.tsx for THEME_PREHYDRATE_SCRIPT). The subscribing
// hook lives in use-theme.ts and is a client-only module.

export type BaseTheme = "light" | "dark";
export type Theme = BaseTheme | "halloween";

const STORAGE_KEY = "canvas-theme";        // stores the base theme
const HALLOWEEN_KEY = "canvas-halloween";  // "1" when halloween overlay is on

export function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const v = document.documentElement.getAttribute("data-theme");
  if (v === "halloween" || v === "dark" || v === "light") return v;
  return "light";
}

/**
 * Set the base theme (light or dark). Clears the halloween overlay if active.
 */
export function setTheme(t: BaseTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(STORAGE_KEY, t);
    localStorage.removeItem(HALLOWEEN_KEY);
  } catch {
    /* localStorage unavailable; attribute is still applied for this session */
  }
}

/**
 * Toggle the base theme. If halloween is currently active, this exits
 * halloween and returns to the stored base theme.
 */
export function toggleTheme(): Theme {
  const current = readTheme();
  if (current === "halloween") {
    let base: BaseTheme = "light";
    try {
      base = localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch {
      /* ignore */
    }
    setTheme(base);
    return base;
  }
  const next: BaseTheme = current === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/**
 * Toggle the halloween overlay. If already active, exits to the base theme.
 * If inactive, stashes the current theme as base and switches to halloween.
 */
export function toggleHalloween(): Theme {
  if (typeof document === "undefined") return "light";
  const current = readTheme();
  if (current === "halloween") {
    let base: BaseTheme = "light";
    try {
      base = localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
      localStorage.removeItem(HALLOWEEN_KEY);
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute("data-theme", base);
    return base;
  }
  const base = current as BaseTheme;
  try {
    localStorage.setItem(STORAGE_KEY, base);
    localStorage.setItem(HALLOWEEN_KEY, "1");
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute("data-theme", "halloween");
  return "halloween";
}

/**
 * The inline-script source used in <head> to apply the saved theme before
 * React hydrates. Prevents a flash of light theme on a dark system, and
 * restores the halloween overlay if the user had it on last session.
 * Keep it IIFE-shaped and dependency-free.
 */
export const THEME_PREHYDRATE_SCRIPT = `
(function(){try{
  var halloween = localStorage.getItem('${HALLOWEEN_KEY}');
  if (halloween === '1') {
    document.documentElement.setAttribute('data-theme', 'halloween');
    return;
  }
  var saved = localStorage.getItem('${STORAGE_KEY}');
  var pref = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', pref);
}catch(e){
  document.documentElement.setAttribute('data-theme', 'light');
}})();
`.trim();
