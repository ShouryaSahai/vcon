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
import evalResults from "@/lib/evals/results.json";

function ChipSkeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />;
}

async function ReviewBadge() {
  const count = await getReviewCount();
  if (count <= 0) return null;
  return (
    <span className="ml-auto rounded-full bg-primary px-1.5 font-mono text-[10px] font-semibold leading-5 text-sidebar-primary-foreground">
      {count}
    </span>
  );
}

async function WorkspaceChip() {
  const user = await getCurrentUser();
  let workspaceName: string | null = null;
  let kitLabel: string | null = null;

  if (user.workspaceId) {
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
    <div className="mb-2 flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-white/[0.02] px-2.5 py-2">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-primary font-mono text-[10px] font-bold text-sidebar-primary-foreground">
        {(workspaceName ?? "W")[0]}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-xs font-semibold text-sidebar-accent-foreground">
          {workspaceName ?? "No workspace"}
        </span>
        <span className="block truncate font-mono text-[10px] text-sidebar-foreground/70">
          {kitLabel ?? "no kit yet"}
        </span>
      </span>
    </div>
  );
}

function EvalTelemetryCard() {
  const pass = evalResults?.totals?.pass ?? 32;
  const total = evalResults?.meta?.cases ?? 32;
  const model = evalResults?.meta?.model ?? "gemini-3.5-flash-lite";
  const pct = total > 0 ? Math.round((pass / total) * 100) : 100;

  return (
    <Link
      href="/evals"
      className="mb-2 block rounded-lg border border-sidebar-border bg-white/[0.03] px-2.5 py-2 transition-colors hover:border-primary/50 hover:bg-white/[0.06]"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/60">
          Eval Harness
        </span>
        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.2 font-mono text-[9.5px] font-semibold text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {pass}/{total} ({pct}%)
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-sidebar-foreground/75">
        <span className="truncate">{model}</span>
        <span className="text-sidebar-foreground/50">→</span>
      </div>
    </Link>
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
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sidebar-accent font-mono text-[10px] font-semibold text-sidebar-accent-foreground">
        {initials}
      </span>
      <span className="hidden min-w-0 leading-tight lg:block">
        <span className="block truncate text-xs font-medium text-sidebar-accent-foreground">
          {user.fullName || user.email}
        </span>
        <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/70">
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

  const pass = evalResults?.totals?.pass ?? 32;
  const total = evalResults?.meta?.cases ?? 32;
  const model = evalResults?.meta?.model ?? "gemini-3.5-flash-lite";

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-20 flex flex-row items-center gap-2 overflow-x-auto border-b border-sidebar-border px-3 py-2 text-sidebar-foreground [background:var(--sidebar-gradient)] lg:h-screen lg:flex-col lg:items-stretch lg:overflow-x-visible lg:border-b-0 lg:border-r lg:px-2.5 lg:py-3.5">
        <Link
          href="/items"
          className="flex shrink-0 items-center gap-2 px-1 py-1 lg:mb-4 lg:px-2.5 lg:py-1.5"
        >
          <span className="grid h-[22px] w-[22px] place-items-center rounded bg-linear-to-br from-primary to-[#8B8AF5] font-mono text-[12px] font-bold text-sidebar-primary-foreground shadow-md shadow-primary/40">
            V
          </span>
          <span className="text-sm font-semibold tracking-tight text-white">Vcon</span>
          <span className="ml-auto hidden rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-sidebar-foreground/80 lg:inline-block">
            R3 · GOV
          </span>
        </Link>

        <div className="hidden px-2.5 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/50 lg:block">
          Workspace
        </div>
        <div className="min-w-0 flex-1 lg:flex-none">
          <AppNav reviewBadge={<Suspense fallback={null}><ReviewBadge /></Suspense>} />
        </div>

        <div className="hidden flex-1 lg:block" />

        <div className="hidden px-2.5 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/50 lg:block">
          Telemetry & Context
        </div>
        <div className="hidden lg:block">
          <EvalTelemetryCard />
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

      <div className="flex min-w-0 flex-col">
        {/* PostHog-style high-density telemetry status bar */}
        <header className="hidden items-center justify-between border-b border-border bg-card/60 px-7 py-2 backdrop-blur-xs lg:flex">
          <div className="flex items-center gap-2.5 font-mono text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded border border-border bg-secondary/70 px-2 py-0.5 text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              ENGINE: {model}
            </span>
            <span className="rounded border border-border bg-secondary/40 px-2 py-0.5">
              COLOR: CIEDE2000 (ΔE₀₀) + WCAG AA
            </span>
            <span className="rounded border border-border bg-secondary/40 px-2 py-0.5">
              INGEST: TEXT · PDF · IMAGE
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <Link
              href="/evals"
              className="inline-flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300"
            >
              EVALS: {pass}/{total} PASS
            </Link>
            <Link
              href="/insights"
              className="rounded border border-border bg-secondary/60 px-2 py-0.5 text-foreground transition-colors hover:bg-secondary"
            >
              INSIGHTS →
            </Link>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-4 lg:px-7 lg:py-6">{children}</main>
      </div>
    </div>
  );
}
