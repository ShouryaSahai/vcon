import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentItem, Database, FindingInsert, KitRule } from "@/lib/db-types";

import {
  checkAltText,
  checkBannedTerms,
  checkDisclaimer,
  checkRequiredTerms,
  type FindingSeed,
} from "./deterministic";
import { checkBrandColor, type RasterImage } from "./color";
import { decodeImage, downloadImage } from "./image";
import { routeFinding } from "./routing";

/**
 * The check pipeline. Deterministic checks run first (this file); grounded AI
 * checks arrive in M6 — every AI finding must cite a kit rule that exists in
 * the checked kit version or it is downgraded to needs_human.
 */
export async function runChecks(
  supabase: SupabaseClient<Database>,
  item: ContentItem,
  checkId: string,
): Promise<{ findings: number; status: ContentItem["status"] }> {
  const { data: rules } = await supabase
    .from("kit_rules")
    .select("*")
    .eq("kit_version_id", item.kit_version_id)
    .eq("is_active", true);

  const seeds: FindingSeed[] = [];
  let image: RasterImage | null = null;

  for (const rule of (rules ?? []) as KitRule[]) {
    try {
      switch (rule.rule_type) {
        case "banned_term":
          seeds.push(...checkBannedTerms(rule, item));
          break;
        case "required_term":
          seeds.push(...checkRequiredTerms(rule, item));
          break;
        case "disclaimer":
          seeds.push(...checkDisclaimer(rule, item));
          break;
        case "alt_text_policy":
          seeds.push(...checkAltText(rule, item));
          break;
        case "brand_color": {
          if (item.source_kind !== "image" || !item.storage_path) break;
          if (!image) {
            image = decodeImage(await downloadImage(supabase, item.storage_path));
          }
          seeds.push(...checkBrandColor(rule, image));
          break;
        }
        default:
          // approved_claim, tone_guideline, custom → grounded AI checks (M6).
          break;
      }
    } catch (error) {
      // One failing checker must not fail the whole run.
      console.error(`[checks] ${rule.rule_type} checker failed:`, error);
    }
  }

  // TODO(M6): AI findings + citation enforcement (no valid kit_rule_id →
  // needs_human), schema-validated model output, one retry.

  const findings: FindingInsert[] = seeds.map((seed) => {
    const rule = (rules ?? []).find((r) => r.id === seed.kit_rule_id);
    const routing = routeFinding(rule?.rule_type ?? "custom", seed.confidence ?? null);
    return {
      ...seed,
      content_item_id: item.id,
      check_id: checkId,
      assigned_to_role: routing.assigned_to_role,
      needs_human: routing.needs_human,
    };
  });

  if (findings.length > 0) {
    const { error } = await supabase.from("findings").insert(findings);
    if (error) throw new Error(error.message);
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
