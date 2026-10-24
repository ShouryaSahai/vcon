import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentItem, Database, FindingInsert, KitRule } from "@/lib/db-types";

import { runAiChecks, AI_RULE_TYPES } from "./ai";
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

export type CheckerOutcome = "ran" | "skipped" | "failed" | "not_applicable";

export type CheckSummary = {
  findings: number;
  status: ContentItem["status"];
  outcome: "complete" | "incomplete";
  checkers: Record<string, CheckerOutcome>;
  incompleteReasons: string[];
};

const DETERMINISTIC_TYPES = [
  "banned_term",
  "required_term",
  "disclaimer",
  "alt_text_policy",
  "brand_color",
] as const;

/**
 * The check pipeline. Deterministic checks run first, then grounded AI checks.
 *
 * Integrity rules:
 *  - every checker's outcome is recorded ("ran" / "skipped" / "failed" /
 *    "not_applicable") in the check summary;
 *  - a failed or skipped checker adds a needs_human finding — a checker that
 *    could not run is NEVER treated as a passed check;
 *  - failing to load kit rules fails the whole run (closed).
 */
export async function runChecks(
  supabase: SupabaseClient<Database>,
  item: ContentItem,
  checkId: string,
): Promise<CheckSummary> {
  const { data: rules, error: rulesError } = await supabase
    .from("kit_rules")
    .select("*")
    .eq("kit_version_id", item.kit_version_id)
    .eq("is_active", true);
  if (rulesError) {
    // Fail closed: without the rules we cannot claim any check ran.
    throw new Error("Could not load kit rules: " + rulesError.message);
  }
  const activeRules = (rules ?? []) as KitRule[];

  const seeds: FindingSeed[] = [];
  const checkers: Record<string, CheckerOutcome> = {};
  const incompleteReasons: string[] = [];
  let image: RasterImage | null = null;

  // ===== Deterministic checkers ==============================================
  const failedTypes = new Set<string>();
  const seenTypes = new Set<string>();

  for (const rule of activeRules) {
    if (!(DETERMINISTIC_TYPES as readonly string[]).includes(rule.rule_type)) continue;
    seenTypes.add(rule.rule_type);
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
      }
    } catch (error) {
      failedTypes.add(rule.rule_type);
      console.error(`[checks] ${rule.rule_type} checker failed:`, error);
    }
  }

  for (const type of DETERMINISTIC_TYPES) {
    if (!seenTypes.has(type)) {
      checkers[type] = "not_applicable";
      continue;
    }
    if (failedTypes.has(type)) {
      checkers[type] = "failed";
      incompleteReasons.push(`The ${type.replace(/_/g, " ")} check could not run.`);
      seeds.push({
        kit_rule_id: null,
        source: "rule_engine",
        title: "Check could not run",
        explanation: `The ${type.replace(/_/g, " ")} check failed with an internal error. A human must review this content manually — this is NOT a pass.`,
        severity: "medium",
        confidence: null,
        suggested_fix: null,
        location: null,
        assigned_to_role: "reviewer",
        needs_human: true,
        status: "open",
      });
    } else {
      checkers[type] = "ran";
    }
  }

  // ===== Grounded AI checks ==================================================
  const aiRules = activeRules.filter((r) =>
    (AI_RULE_TYPES as readonly string[]).includes(r.rule_type),
  );
  if (aiRules.length === 0) {
    checkers.ai = "not_applicable";
  } else if (!process.env.GEMINI_API_KEY) {
    checkers.ai = "skipped";
    incompleteReasons.push("AI checks did not run (model not configured).");
    seeds.push({
      kit_rule_id: null,
      source: "ai",
      title: "AI checks did not run",
      explanation:
        "The AI checker is not configured in this deployment, so tone, claim and terminology rules were NOT evaluated. This is NOT a pass.",
      severity: "medium",
      confidence: null,
      suggested_fix: null,
      location: null,
      assigned_to_role: "reviewer",
      needs_human: true,
      status: "open",
    });
  } else {
    try {
      const result = await runAiChecks(aiRules, item);
      seeds.push(...result.seeds);
      checkers.ai = result.status === "failed" ? "failed" : "ran";
      if (result.status === "failed") {
        incompleteReasons.push("AI checks failed: " + (result.error ?? "unknown error"));
      }
    } catch (error) {
      checkers.ai = "failed";
      const message = error instanceof Error ? error.message : String(error);
      incompleteReasons.push("AI checks failed: " + message);
      console.error("[checks] AI checker failed:", error);
    }
  }

  // Citation + routing pass — applied to every seed uniformly.
  const findings: FindingInsert[] = seeds.map((seed) => {
    const rule = activeRules.find((r) => r.id === seed.kit_rule_id);
    const routing = routeFinding(rule?.rule_type ?? "custom", seed.confidence ?? null);
    return {
      ...seed,
      content_item_id: item.id,
      check_id: checkId,
      // Uncited findings (failed or skipped checkers) keep forced human review.
      assigned_to_role:
        seed.kit_rule_id === null ? "reviewer" : routing.assigned_to_role,
      needs_human: routing.needs_human || seed.needs_human === true,
    };
  });

  if (findings.length > 0) {
    const { error } = await supabase.from("findings").insert(findings);
    if (error) throw new Error(error.message);
  }

  // Status: open creator findings mean the creator loop runs first
  // (needs_changes); otherwise the item goes to review. An incomplete run is
  // surfaced via the check summary and needs_human findings — never as a pass.
  const hasCreatorWork = findings.some(
    (f) => f.assigned_to_role === "creator" && f.status === "open",
  );
  const status: ContentItem["status"] = hasCreatorWork ? "needs_changes" : "in_review";

  await supabase.from("content_items").update({ status }).eq("id", item.id);

  const outcome: CheckSummary["outcome"] =
    incompleteReasons.length > 0 ? "incomplete" : "complete";

  const { error } = await supabase
    .from("checks")
    .update({
      status: "done",
      finished_at: new Date().toISOString(),
      summary: {
        findings: findings.length,
        status,
        outcome,
        checkers,
        incompleteReasons,
      },
    })
    .eq("id", checkId);
  if (error) throw new Error(error.message);

  return { findings: findings.length, status, outcome, checkers, incompleteReasons };
}
