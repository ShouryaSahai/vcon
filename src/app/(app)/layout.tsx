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

function VconNBadge({
  idPrefix,
  size = 24,
}: {
  idPrefix: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 rounded-full ring-1 ring-white/15"
      aria-hidden="true"
    >
      <mask
        id={`${idPrefix}-mask`}
        style={{ maskType: "alpha" }}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="180"
        height="180"
      >
        <circle cx="90" cy="90" r="90" fill="black" />
      </mask>
      <g mask={`url(#${idPrefix}-mask)`}>
        <circle cx="90" cy="90" r="90" fill="black" />
        <path
          d="M149.508 157.52L69.142 54H54V125.97H66.1136V69.3836L139.999 164.845C143.333 162.614 146.509 160.165 149.508 157.52Z"
          fill={`url(#${idPrefix}-grad1)`}
        />
        <rect
          x="115"
          y="54"
          width="12"
          height="72"
          fill={`url(#${idPrefix}-grad2)`}
        />
      </g>
      <defs>
        <linearGradient
          id={`${idPrefix}-grad1`}
          x1="109"
          y1="116.5"
          x2="144.5"
          y2="160.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={`${idPrefix}-grad2`}
          x1="121"
          y1="54"
          x2="120.799"
          y2="106.875"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ChipSkeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />;
}

async function ReviewBadge() {
  const count = await getReviewCount();
  if (count <= 0) return null;
  return (
    <span className="ml-auto rounded-full bg-white/15 px-1.5 font-mono text-[10px] font-semibold leading-5 text-white">
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
    <div className="mb-2 flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-white/[0.03] px-2.5 py-2">
      <VconNBadge idPrefix="vcon-ws-chip" size={20} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-xs font-semibold text-sidebar-accent-foreground">
          {workspaceName ?? "Vcon Core"}
        </span>
        <span className="block truncate font-mono text-[10px] text-sidebar-foreground/70">
          {kitLabel ?? "Active Policy Kit"}
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

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background text-foreground lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-20 flex flex-row items-center gap-2 overflow-x-auto border-b border-sidebar-border px-3 py-2 text-sidebar-foreground [background:var(--sidebar-gradient)] lg:h-screen lg:flex-col lg:items-stretch lg:overflow-x-visible lg:border-b-0 lg:border-r lg:px-2.5 lg:py-3.5">
        <Link
          href="/items"
          className="flex shrink-0 items-center gap-2.5 px-1 py-1 lg:mb-4 lg:px-2.5 lg:py-1.5"
        >
          <VconNBadge idPrefix="vcon-top-nav" size={24} />
          <span className="text-sm font-semibold tracking-tight text-white">
            Vcon
          </span>
          <span className="ml-auto hidden rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-sidebar-foreground/80 lg:inline-block">
            CORE
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
          Environment
        </div>
        <div className="hidden lg:block">
          <Suspense fallback={<ChipSkeleton className="mb-2 h-[46px] border border-sidebar-border" />}>
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
        <main className="min-w-0 flex-1 px-4 py-5 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}