import Link from "next/link";
import { Suspense } from "react";

import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentUser, getReviewCount } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/cached";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { RefreshButton } from "@/components/refresh-button";
import { ROLE_LABELS } from "@/lib/types";

/**
 * Static app shell (Cache Components): the sidebar chrome and main frame
 * prerender, so every navigation paints instantly. Only the session-derived
 * holes below stream in — usually already in the browser's private cache.
 */

function ChipSkeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />;
}

async function ReviewBadge() {
  const count = await getReviewCount();
  if (count <= 0) return null;
  return (
    <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-sidebar-primary-foreground">
      {count}
    </span>
  );
}

async function WorkspaceChip() {
  const user = await getCurrentUser();
  let workspaceName: string | null = null;
  let kitLabel: string | null = null;

  if (user.workspaceId) {
    // Kit rules + version are cached per session (published versions are
    // immutable; publishing revalidates the tag).
    const supabase = await createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? "";
    if (accessToken) {
      const ctx = await getWorkspaceContext(accessToken, user.workspaceId);
      workspaceName = ctx.workspaceName;
      kitLabel = ctx.kitLabel;
    }
  }

  return (
    <div className="mb-2 flex items-center gap-2.5 rounded-lg border border-sidebar-border px-2.5 py-2">
      <span className="grid h-5 w-5 place-items-center rounded-md bg-primary text-[10px] font-bold text-sidebar-primary-foreground">
        {(workspaceName ?? "W")[0]}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-xs font-semibold text-sidebar-accent-foreground">
          {workspaceName ?? "No workspace"}
        </span>
        <span className="block truncate text-[10.5px] text-sidebar-foreground/70">
          {kitLabel ?? "no kit yet"}
        </span>
      </span>
    </div>
  );
}

async function UserChip() {
  const user = await getCurrentUser();
  const initials = (user.fullName || user.email || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sidebar-accent text-[10px] font-semibold text-sidebar-accent-foreground">
        {initials}
      </span>
      <span className="hidden min-w-0 leading-tight lg:block">
        <span className="block truncate text-xs font-medium text-sidebar-accent-foreground">
          {user.fullName || user.email}
        </span>
        <span className="block truncate text-[10.5px] text-sidebar-foreground/70">
          {ROLE_LABELS[user.role]}
        </span>
      </span>
    </span>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Supabase is not configured yet.</p>
          <p className="mt-1">
            Copy <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
            <code className="rounded bg-amber-50 px-1">.env.local</code>, fill in your Supabase
            URL and anon key, then restart the server.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[224px_1fr]">
      {/* Sidebar — dark navy gradient; horizontal top bar below laptop width */}
      <aside className="sticky top-0 z-20 flex flex-row items-center gap-2 overflow-x-auto border-b border-sidebar-border px-3 py-2 text-sidebar-foreground [background:var(--sidebar-gradient)] lg:h-screen lg:flex-col lg:items-stretch lg:overflow-x-visible lg:border-b-0 lg:border-r lg:px-2.5 lg:py-3.5">
        <Link
          href="/items"
          className="flex shrink-0 items-center gap-2 px-1 py-1 lg:mb-4 lg:px-2.5 lg:py-1.5"
        >
          <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-linear-to-br from-primary to-[#8B8AF5] text-[12px] font-bold text-sidebar-primary-foreground shadow-md shadow-primary/40">
            V
          </span>
          <span className="text-sm font-semibold tracking-tight text-white">Vcon</span>
        </Link>

        <div className="hidden px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/50 lg:block">
          Workspace
        </div>
        <div className="min-w-0 flex-1 lg:flex-none">
          <AppNav reviewBadge={<Suspense fallback={null}><ReviewBadge /></Suspense>} />
        </div>

        <div className="hidden flex-1 lg:block" />

        <div className="hidden px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/50 lg:block">
          Context
        </div>
        <div className="hidden lg:block">
          <Suspense fallback={<ChipSkeleton className="mb-2 h-[52px] border border-sidebar-border" />}>
            <WorkspaceChip />
          </Suspense>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 rounded-lg px-1 py-1 lg:ml-0 lg:gap-2.5 lg:px-2.5 lg:py-2">
          <Suspense fallback={<ChipSkeleton className="h-6 w-6 rounded-full" />}>
            <UserChip />
          </Suspense>
          <span className="ml-auto flex items-center">
            <RefreshButton />
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="grid h-7 w-7 place-items-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v10" />
                  <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                </svg>
              </button>
            </form>
          </span>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-4 lg:px-7 lg:py-6">{children}</main>
    </div>
  );
}
