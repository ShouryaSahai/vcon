import type { KitRule } from "@/lib/db-types";

/**
 * Vcon's labeled evaluation set (Round 3, T1).
 *
 * The fixtures below mirror `supabase/seed.sql` (GlowNaturals kit v1, 8 rules)
 * EXACTLY — same names, payloads and severities — so the eval scores measure
 * the product against its real published contract, not a parallel universe.
 *
 * Each case runs against ONE checker family in isolation:
 *   - "deterministic" cases see only the 5 deterministic rules;
 *   - "ai" cases see only the 3 grounded AI rules.
 * That gives exact attribution: no cross-family noise, so a false flag is a
 * real false flag. Expectations are exact — the case passes only when the
 * flagged rule set equals the expected rule set.
 */

// ===== Kit fixture (mirrors supabase/seed.sql byte-for-byte) ================

const R = (id: string, rule_type: KitRule["rule_type"], name: string, payload: object, severity_default: KitRule["severity_default"]): KitRule => ({
  id,
  kit_version_id: "00000000-0000-4000-8000-000000000000",
  rule_type,
  name,
  payload: payload as KitRule["payload"],
  severity_default,
  is_active: true,
  created_at: "2026-10-25T00:00:00Z",
});

export const RULE_BANNED_MIRACLE = R(
  "00000000-0000-4000-8000-0000000000b1",
  "banned_term",
  'Banned: "miracle"',
  { terms: ["miracle", "miraculous"] },
  "high",
);

export const RULE_BANNED_CHEMICAL = R(
  "00000000-0000-4000-8000-0000000000b2",
  "banned_term",
  'Banned: "chemical-free"',
  { terms: ["chemical-free", "chemical free"] },
  "high",
);

export const RULE_DISCLAIMER = R(
  "00000000-0000-4000-8000-0000000000b3",
  "disclaimer",
  "Disclaimer with performance claims",
  { trigger_terms: ["clinically proven"], required_text: "Results may vary" },
  "medium",
);

export const RULE_ALT_TEXT = R(
  "00000000-0000-4000-8000-0000000000b4",
  "alt_text_policy",
  "Alt text required",
  { require_alt_text: true, min_length: 20 },
  "medium",
);

export const RULE_PALETTE = R(
  "00000000-0000-4000-8000-0000000000b5",
  "brand_color",
  "Approved palette",
  {
    colors: [
      { name: "Sage", hex: "#7C9A6D" },
      { name: "Honey", hex: "#E8B04B" },
      { name: "Linen", hex: "#F5F1E8" },
    ],
    max_delta_e: 10,
  },
  "low",
);

export const RULE_CLAIMS = R(
  "00000000-0000-4000-8000-0000000000a1",
  "approved_claim",
  "Approved claims (C-12)",
  {
    allowed: ["made with natural ingredients", "dermatologist tested"],
    explicitly_disallowed: ["100% natural", "100% organic", "cures acne"],
  },
  "high",
);

export const RULE_TONE = R(
  "00000000-0000-4000-8000-0000000000a2",
  "tone_guideline",
  "Voice: warm, plain-spoken",
  { voice: "Warm, plain-spoken, no hype.", avoid: ["excessive exclamation marks", "ALL-CAPS words", "fear-based urgency"] },
  "medium",
);

export const RULE_TERMINOLOGY = R(
  "00000000-0000-4000-8000-0000000000a3",
  "custom",
  "Terminology: brand name",
  { preferred: "GlowNaturals", avoid: ["Glow Naturals"] },
  "low",
);

export const DETERMINISTIC_RULES: KitRule[] = [
  RULE_PALETTE,
  RULE_BANNED_MIRACLE,
  RULE_BANNED_CHEMICAL,
  RULE_DISCLAIMER,
  RULE_ALT_TEXT,
];

export const AI_RULES: KitRule[] = [RULE_CLAIMS, RULE_TONE, RULE_TERMINOLOGY];

// ===== Cases =================================================================

export type EvalFamily = "deterministic" | "ai";

export type EvalCase = {
  id: string;
  family: EvalFamily;
  title: string;
  /** what the case is designed to prove */
  notes?: string;
  context_type: "instagram_post" | "blog" | "ad" | "email" | "other";
  source_kind: "text" | "image";
  text_content: string | null;
  alt_text: string | null;
  /** solid fill for synthetic image cases (source_kind: "image") */
  imageColor?: string;
  /** exact set of rule NAMES that must be flagged — [] means must stay clean */
  expect: string[];
};

const T = (partial: Omit<EvalCase, "context_type"> & Partial<Pick<EvalCase, "context_type">>): EvalCase => ({
  context_type: "instagram_post",
  ...partial,
});

export const EVAL_CASES: EvalCase[] = [
  // ---- deterministic: banned terms (E1) ------------------------------------
  T({ id: "D01", family: "deterministic", title: "Banned term “miracle glow”", notes: "E1 seeded error", source_kind: "text", text_content: "Feel the miracle glow with our new serum.", alt_text: null, expect: [RULE_BANNED_MIRACLE.name] }),
  T({ id: "D02", family: "deterministic", title: "Banned variant “miraculous”", notes: "second term in same rule payload", source_kind: "text", text_content: "A miraculous transformation for your skin.", alt_text: null, expect: [RULE_BANNED_MIRACLE.name] }),
  T({ id: "D03", family: "deterministic", title: "Banned “chemical-free”", notes: "hyphenated form", source_kind: "text", text_content: "Our chemical-free formula is gentle.", alt_text: null, expect: [RULE_BANNED_CHEMICAL.name] }),
  T({ id: "D04", family: "deterministic", title: "Banned “chemical free”", notes: "space form of the same banned term", source_kind: "text", text_content: "It is completely chemical free.", alt_text: null, expect: [RULE_BANNED_CHEMICAL.name] }),
  T({ id: "D05", family: "deterministic", title: "Word boundary: “Miracles happen”", notes: "substring must NOT match (word-boundary anchoring)", source_kind: "text", text_content: "Miracles happen every day.", alt_text: null, expect: [] }),
  T({ id: "D06", family: "deterministic", title: "Case-insensitive: “MIRACLE”", notes: "case-insensitive matching", source_kind: "text", text_content: "The MIRACLE ingredient everyone talks about.", alt_text: null, expect: [RULE_BANNED_MIRACLE.name] }),

  // ---- deterministic: disclaimer (E3) ----------------------------------------
  T({ id: "D07", family: "deterministic", title: "Performance claim without disclaimer", notes: "E3 seeded error", source_kind: "text", text_content: "Clinically proven to smooth skin in days.", alt_text: null, expect: [RULE_DISCLAIMER.name] }),
  T({ id: "D08", family: "deterministic", title: "Trigger present, disclaimer present", notes: "required text satisfies the rule", source_kind: "text", text_content: "Clinically proven to smooth skin. Results may vary.", alt_text: null, expect: [] }),
  T({ id: "D09", family: "deterministic", title: "No performance claim at all", notes: "trigger absent → disclaimer not required", source_kind: "text", text_content: "A gentle moisturizer for daily use.", alt_text: null, expect: [] }),

  // ---- deterministic: alt text (E5) -----------------------------------------
  T({ id: "D10", family: "deterministic", title: "Image with no alt text", notes: "E5 seeded error", source_kind: "image", text_content: null, alt_text: null, imageColor: "#7C9A6D", expect: [RULE_ALT_TEXT.name] }),
  T({ id: "D11", family: "deterministic", title: "Alt text under minimum length", notes: "min_length 20", source_kind: "image", text_content: null, alt_text: "Sage jar", imageColor: "#7C9A6D", expect: [RULE_ALT_TEXT.name] }),
  T({ id: "D12", family: "deterministic", title: "Valid alt text", notes: "≥ 20 characters", source_kind: "image", text_content: null, alt_text: "A sage-green jar of moisturizer on linen.", imageColor: "#7C9A6D", expect: [] }),
  T({ id: "D13", family: "deterministic", title: "Alt text on a text post", notes: "policy applies to images only", source_kind: "text", text_content: "Plain text post, no image involved.", alt_text: null, expect: [] }),

  // ---- deterministic: brand palette (E4) ------------------------------------
  T({ id: "D14", family: "deterministic", title: "Off-palette hot pink", notes: "E4 seeded error", source_kind: "image", text_content: null, alt_text: "A bright pink product flat lay.", imageColor: "#FF69B4", expect: [RULE_PALETTE.name] }),
  T({ id: "D15", family: "deterministic", title: "On-palette sage", notes: "exact palette colour", source_kind: "image", text_content: null, alt_text: "A sage-green jar on a linen cloth.", imageColor: "#7C9A6D", expect: [] }),
  T({ id: "D16", family: "deterministic", title: "On-palette honey", source_kind: "image", text_content: null, alt_text: "A honey-toned bottle in soft light.", imageColor: "#E8B04B", expect: [] }),
  T({ id: "D17", family: "deterministic", title: "Slightly off-palette", notes: "just past the ΔE 10 limit", source_kind: "image", text_content: null, alt_text: "An amber-toned bottle in soft light.", imageColor: "#D08519", expect: [RULE_PALETTE.name] }),

  // ---- deterministic: combined + negatives ----------------------------------
  T({ id: "D18", family: "deterministic", title: "Three violations in one caption", notes: "multi-hit attribution", source_kind: "text", text_content: "A miracle chemical-free cream, clinically proven overnight.", alt_text: null, expect: [RULE_BANNED_MIRACLE.name, RULE_BANNED_CHEMICAL.name, RULE_DISCLAIMER.name] }),
  T({ id: "D19", family: "deterministic", title: "Clean caption", notes: "negative control (seeded)", source_kind: "text", text_content: "Made with natural ingredients. Patch test recommended. Results may vary.", alt_text: null, expect: [] }),
  T({ id: "D20", family: "deterministic", title: "Clean image post", notes: "on-palette image + valid alt text", source_kind: "image", text_content: null, alt_text: "A linen background with a sage-green cream jar.", imageColor: "#F5F1E8", expect: [] }),

  // ---- ai: approved claims (E2) ------------------------------------------------
  T({ id: "A01", family: "ai", title: "“100% natural” claim", notes: "E2 seeded error — explicitly disallowed", source_kind: "text", text_content: "100% natural ingredients, straight from the garden.", alt_text: null, expect: [RULE_CLAIMS.name] }),
  T({ id: "A02", family: "ai", title: "“100% organic” claim", notes: "explicitly disallowed variant", source_kind: "text", text_content: "100% organic and untouched by science.", alt_text: null, expect: [RULE_CLAIMS.name] }),
  T({ id: "A03", family: "ai", title: "“cures acne” claim", notes: "medical-style disallowed claim", source_kind: "text", text_content: "This serum cures acne in a week.", alt_text: null, expect: [RULE_CLAIMS.name] }),
  T({ id: "A04", family: "ai", title: "Approved claim phrasing", notes: "must NOT be flagged", source_kind: "text", text_content: "Made with natural ingredients you can pronounce.", alt_text: null, expect: [] }),
  T({ id: "A05", family: "ai", title: "Second approved phrasing", notes: "“dermatologist tested” is allowed", source_kind: "text", text_content: "Dermatologist tested and gentle for daily use.", alt_text: null, expect: [] }),

  // ---- ai: tone (E6) ------------------------------------------------------------
  T({ id: "A06", family: "ai", title: "Hype + ALL CAPS", notes: "E6 seeded error", source_kind: "text", text_content: "AMAZING RESULTS!!! You will LOVE this miracle-free glow!", alt_text: null, expect: [RULE_TONE.name] }),
  T({ id: "A07", family: "ai", title: "Fear-based urgency", notes: "avoid-list tone violation", source_kind: "text", text_content: "Buy now or you will regret missing this forever.", alt_text: null, expect: [RULE_TONE.name] }),
  T({ id: "A08", family: "ai", title: "Warm, plain-spoken caption", notes: "negative control for tone", source_kind: "text", text_content: "We think you will like this. It is simple, honest skincare for real days.", alt_text: null, expect: [] }),

  // ---- ai: terminology (E7) -----------------------------------------------------
  T({ id: "A09", family: "ai", title: "“Glow Naturals” spelled apart", notes: "E7 seeded error", source_kind: "text", text_content: "Glow Naturals is my go-to for calm mornings.", alt_text: null, expect: [RULE_TERMINOLOGY.name] }),
  T({ id: "A10", family: "ai", title: "Brand name spelled correctly", notes: "negative control for terminology", source_kind: "text", text_content: "GlowNaturals fits quietly into a slow morning routine.", alt_text: null, expect: [] }),

  // ---- ai: mixed ----------------------------------------------------------------
  T({ id: "A11", family: "ai", title: "Claim + tone together", notes: "two AI rules in one caption", source_kind: "text", text_content: "This is 100% natural — and the results are ABSOLUTELY AMAZING!!!", alt_text: null, expect: [RULE_CLAIMS.name, RULE_TONE.name] }),
  T({ id: "A12", family: "ai", title: "Clean caption for all AI rules", notes: "full AI negative control", source_kind: "text", text_content: "Made with natural ingredients and dermatologist tested. We hope it earns a place in your routine.", alt_text: null, expect: [] }),
];
