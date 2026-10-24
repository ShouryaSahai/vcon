import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";

/**
 * Cached read models. Args must be serializable, so callers pass the user's
 * access token (RLS still applies — the cache is per session) plus ids.
 *
 * Safe to cache by design: published kit versions are immutable (enforced by
 * the kit_rules_draft_only DB trigger), and server actions revalidate these
 * tags when a kit changes.
 */

function clientFor(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );
}

export type WorkspaceContext = {
  workspaceName: string | null;
  kitLabel: string | null;
};

export async function getWorkspaceContext(
  accessToken: string,
  workspaceId: string,
): Promise<WorkspaceContext> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 300 });
  cacheTag(`ws-${workspaceId}`);

  const supabase = clientFor(accessToken);
  const [{ data: workspace }, { data: kit }] = await Promise.all([
    supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    supabase.from("brand_kits").select("current_version_id").eq("workspace_id", workspaceId).maybeSingle(),
  ]);

  let kitLabel: string | null = null;
  if (kit?.current_version_id) {
    const { data: version } = await supabase
      .from("kit_versions")
      .select("version_number, status")
      .eq("id", kit.current_version_id)
      .maybeSingle();
    if (version) kitLabel = `Kit v${version.version_number} · ${version.status}`;
  }

  return { workspaceName: workspace?.name ?? null, kitLabel };
}

export type KitContext = {
  version: { version_number: number; status: string } | null;
  rules: { id: string; name: string; rule_type: string }[];
};

export async function getKitContext(
  accessToken: string,
  kitVersionId: string,
): Promise<KitContext> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 300 });
  cacheTag(`kitver-${kitVersionId}`);

  const supabase = clientFor(accessToken);
  const [{ data: version }, { data: rules }] = await Promise.all([
    supabase.from("kit_versions").select("version_number, status").eq("id", kitVersionId).maybeSingle(),
    supabase.from("kit_rules").select("id, name, rule_type").eq("kit_version_id", kitVersionId),
  ]);
  return { version, rules: rules ?? [] };
}
