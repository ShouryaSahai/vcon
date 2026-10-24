import Link from "next/link";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

// Session-reading shell: allowed to block on the server (Cache Components opt-out).
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Supabase is not configured yet.</p>
          <p className="mt-1">
            Copy <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
            <code className="rounded bg-amber-100 px-1">.env.local</code>, fill in your Supabase
            URL and anon key, then restart the server.
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { count: reviewCount }] = await Promise.all([
    supabase.from("profiles").select("id, workspace_id, full_name, role").eq("id", user.id).maybeSingle(),
    supabase.from("content_items").select("id", { count: "exact", head: true }).eq("status", "in_review"),
  ]);

  // Workspace context for the sidebar chip.
  let workspaceName: string | null = null;
  let kitLabel: string | null = null;
  if (profile?.workspace_id) {
    const [{ data: workspace }, { data: kit }] = await Promise.all([
      supabase.from("workspaces").select("name").eq("id", profile.workspace_id).maybeSingle(),
      supabase
        .from("brand_kits")
        .select("name, current_version_id")
        .eq("workspace_id", profile.workspace_id)
        .maybeSingle(),
    ]);
    workspaceName = workspace?.name ?? null;
    if (kit?.current_version_id) {
      const { data: version } = await supabase
        .from("kit_versions")
        .select("version_number, status")
        .eq("id", kit.current_version_id)
        .maybeSingle();
      if (version) kitLabel = `Kit v${version.version_number} · ${version.status}`;
    }
  }

  const initials = (profile?.full_name || user.email || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const role = (profile?.role ?? "creator") as UserRole;

  return (
    <div className="grid min-h-screen grid-cols-[224px_1fr]">
      {/* Sidebar — dark navy in both themes */}
      <aside className="sticky top-0 flex h-screen flex-col border-r border-sidebar-border bg-sidebar px-2.5 py-3.5 text-sidebar-foreground">
        <Link href="/" className="mb-4 flex items-center gap-2 px-2.5 py-1.5">
          <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-primary text-[12px] font-bold text-sidebar-primary-foreground">
            V
          </span>
          <span className="text-sm font-semibold tracking-tight text-white">Vcon</span>
        </Link>

        <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/50">
          Workspace
        </div>
        <AppNav reviewCount={reviewCount ?? 0} />

        <div className="flex-1" />

        <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/50">
          Context
        </div>
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

        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-sidebar-accent text-[10px] font-semibold text-sidebar-accent-foreground">
            {initials}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-xs font-medium text-sidebar-accent-foreground">
              {profile?.full_name || user.email}
            </span>
            <span className="block truncate text-[10.5px] text-sidebar-foreground/70">
              {ROLE_LABELS[role]}
            </span>
          </span>
          <span className="ml-auto flex items-center">
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

      <main className="min-w-0 px-7 py-6">{children}</main>
    </div>
  );
}
