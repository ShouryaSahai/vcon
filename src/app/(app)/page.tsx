import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

// Session-reading page: allowed to block on the server (Cache Components opt-out).
export const instant = false;

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, workspace_id, full_name, role, created_at")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold text-foreground">Workspace overview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Auth with roles and workspace isolation is wired up. Next milestone (M1) adds the
          seeded demo brand kit.
        </p>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-28 font-medium text-muted-foreground">Signed in as</dt>
            <dd className="text-foreground">{user?.email}</dd>
          </div>
          {profile && (
            <>
              <div className="flex gap-2">
                <dt className="w-28 font-medium text-muted-foreground">Role</dt>
                <dd className="text-foreground">{ROLE_LABELS[profile.role as UserRole]}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 font-medium text-muted-foreground">Workspace</dt>
                <dd className="text-foreground">
                  {profile.workspace_id ? "Assigned ✓" : "Not assigned yet"}
                </dd>
              </div>
            </>
          )}
        </dl>
      </section>

      {profile && !profile.workspace_id && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Your account has no workspace yet, so nothing is visible to you (RLS enforced).
          Run <code className="rounded bg-amber-100 px-1">supabase/bootstrap.sql</code> as the
          project owner to create the first admin and workspace.
        </section>
      )}
    </div>
  );
}
