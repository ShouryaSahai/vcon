import Link from "next/link";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

// Session-reading shell: allowed to block on the server (Cache Components opt-out).
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, workspace_id, full_name, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
            Vcon
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <nav className="flex items-center gap-3">
              <Link href="/" className="text-slate-600 hover:text-slate-900">Home</Link>
              <Link href="/upload" className="text-slate-600 hover:text-slate-900">Upload</Link>
              <Link href="/items" className="text-slate-600 hover:text-slate-900">Items</Link>
              <Link href="/review" className="text-slate-600 hover:text-slate-900">Review</Link>
              <Link href="/kit" className="text-slate-600 hover:text-slate-900">Kit</Link>
            </nav>
            <div className="flex items-center gap-3">
              {profile ? (
              <>
                <span className="text-slate-700">{profile.full_name || user.email}</span>
                <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {ROLE_LABELS[profile.role as UserRole]}
                </span>
              </>
            ) : (
              <span className="text-xs font-medium text-red-600">
                No profile row — run supabase/migrations/0001_init.sql
              </span>
            )}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Sign out
              </button>
            </form>
          </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
