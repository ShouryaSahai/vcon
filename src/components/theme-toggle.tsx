"use client";

import { useSyncExternalStore } from "react";

/**
 * Light/dark toggle. Persists to localStorage ("vcon-theme"); light is the
 * default. The pre-paint script in the root layout applies the stored theme
 * before hydration to avoid a flash.
 *
 * The html.dark class is owned by that script (and this toggle), so it is read
 * as an external store: the server snapshot is "unknown" (null — moon icon,
 * matching the pre-hydration markup), and the live snapshot tracks the class
 * via MutationObserver, so the icon corrects itself right after hydration and
 * on any class change — without a setState-in-effect.
 */
function subscribeToHtmlClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

export function ThemeToggle() {
  const dark = useSyncExternalStore<boolean | null>(
    subscribeToHtmlClass,
    () => document.documentElement.classList.contains("dark"),
    () => null,
  );

  function toggle() {
    const next = !(dark ?? false);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("vcon-theme", next ? "dark" : "light");
    } catch {
      /* private mode — theme just won't persist */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="grid h-7 w-7 place-items-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      {dark ? (
        // sun
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.3 11.3 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // moon
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
