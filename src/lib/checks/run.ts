import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentItem, Database, FindingInsert } from "@/lib/db-types";

/**
 * The check pipeline. Runs deterministic checks first, then grounded AI
 * checks — every finding must cite a kit rule that exists in the checked
 * kit version, or it is downgraded to needs_human (M6 enforces this).
 *
 * M3: pipeline shell with stub checkers so upload → check → status works
 * end to end. M4 fills the deterministic checkers, M6 the AI checks.
 */
export async function runChecks(
  supabase: SupabaseClient<Database>,
  item: Pick<ContentItem, "id" | "workspace_id" | "kit_version_id">,
  checkId: string,
): Promise<{ findings: number; status: ContentItem["status"] }> {
  // TODO(M4): deterministic checkers — banned terms, required disclaimers,
  // image palette vs approved colours, alt text presence.
  // TODO(M6): grounded AI checks (tone, claim wording, terminology, alt-text
  // quality) with schema-validated output and citation enforcement.
  const findings: FindingInsert[] = [];

  if (findings.length > 0) {
    await supabase
      .from("findings")
      .insert(findings.map((f) => ({ ...f, content_item_id: item.id, check_id: checkId })));
  }

  const needsReviewer = findings.some(
    (f) => f.assigned_to_role === "reviewer" || f.needs_human === true,
  );
  const status: ContentItem["status"] =
    findings.length === 0 || needsReviewer ? "in_review" : "needs_changes";

  await supabase.from("content_items").update({ status }).eq("id", item.id);

  const { error } = await supabase
    .from("checks")
    .update({
      status: "done",
      finished_at: new Date().toISOString(),
      summary: { findings: findings.length, status },
    })
    .eq("id", checkId);
  if (error) throw new Error(error.message);

  return { findings: findings.length, status };
}
