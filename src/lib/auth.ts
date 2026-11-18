import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  workspaceId: string | null;
};

export const getCurrentUser = cache(async (): Promise<SessionUser> => {
  "use cache: private";

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user;
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
});

export const getReviewCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "in_review");

  return count ?? 0;
});