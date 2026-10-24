"use client";

import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { useTransition } from "react";

/**
 * Soft refresh: re-fetches the current route's server data (findings, counts,
 * status) without a full page reload — keeps scroll position and client state
 * like list filters. Spins while the re-render streams in.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label="Refresh data"
      title="Refresh data"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="grid h-7 w-7 place-items-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-60"
    >
      <RotateCw className={`h-3.5 w-3.5${pending ? " animate-spin" : ""}`} />
    </button>
  );
}
