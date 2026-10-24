import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

/**
 * Session reads for the app shell, cached per browser ("use cache: private").
 * The result never lives on the server; the App Shell prefetches it per
 * session, so authenticated navigations render instantly. redirect() throws,
 * so only a resolved session is cached (per the Next.js auth guide).
 */
export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  workspaceId: string | null;
};

export async function getCurrentUser(): Promise<SessionUser> {
  "use cache: private";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? null,
    role: (profile?.role ?? "creator") as UserRole,
    workspaceId: profile?.workspace_id ?? null,
  };
}

/**
 * Review-queue badge count. Deliberately uncached (request-time read inside
 * its own Suspense hole): the badge stays honest after decisions, and the
 * shell's Refresh button always shows the current count. Navigations remain
 * instant — the shell streams this hole in separately.
 */
export async function getReviewCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "in_review");

  return count ?? 0;
}
