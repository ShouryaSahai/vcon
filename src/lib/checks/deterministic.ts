import type { FindingInsert, KitRule } from "@/lib/db-types";

// Seed for one finding: ids are attached by the pipeline at insert time.
export type FindingSeed = Omit<FindingInsert, "check_id" | "content_item_id">;

type TextItem = {
  source_kind: "text" | "image" | "docx";
  text_content: string | null;
  alt_text: string | null;
};

const MAX_OCCURRENCES = 5;

/** Case-insensitive whole-phrase occurrences (word-boundary anchored). */
export function findOccurrences(
  text: string,
  term: string,
): { start: number; end: number }[] {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "gi");
  const out: { start: number; end: number }[] = [];
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    out.push({ start, end: start + match[0].length });
    if (out.length >= MAX_OCCURRENCES) break;
  }
  return out;
}

function excerptAt(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 24);
  const to = Math.min(text.length, end + 24);
  return `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`;
}

function base(rule: KitRule, title: string, explanation: string) {
  return {
    kit_rule_id: rule.id,
    source: "rule_engine" as const,
    title,
    explanation,
    severity: rule.severity_default,
    suggested_fix: null,
    location: null,
    confidence: null,
    assigned_to_role: "creator" as const,
    needs_human: false,
    status: "open" as const,
  };
}

function payloadOf<T>(rule: KitRule): T {
  return (rule.payload ?? {}) as T;
}

// ===== E1: banned_term =======================================================

export function checkBannedTerms(rule: KitRule, item: TextItem): FindingSeed[] {
  const text = item.text_content ?? "";
  if (!text) return [];
  const { terms } = payloadOf<{ terms?: string[] }>(rule);
  const out: FindingSeed[] = [];
  for (const term of terms ?? []) {
    for (const loc of findOccurrences(text, term)) {
      out.push({
        ...base(
          rule,
          `Banned term: “${term}”`,
          `The content uses “${term}”, which this brand kit bans (rule “${rule.name}”). ` +
            `Banned terms are removed before publication, so this must change.`,
        ),
        location: { type: "text", ...loc, excerpt: excerptAt(text, loc.start, loc.end) },
        suggested_fix: `Replace “${term}” with approved wording.`,
      });
    }
  }
  return out;
}

// ===== required_term =========================================================

export function checkRequiredTerms(rule: KitRule, item: TextItem): FindingSeed[] {
  const text = item.text_content ?? "";
  if (!text) return [];
  const { terms } = payloadOf<{ terms?: string[] }>(rule);
  const out: FindingSeed[] = [];
  for (const term of terms ?? []) {
    if (findOccurrences(text, term).length === 0) {
      out.push({
        ...base(
          rule,
          `Required term missing: “${term}”`,
          `Rule “${rule.name}” requires the content to include “${term}”.`,
        ),
        location: { type: "text" },
        suggested_fix: `Add “${term}” to the content.`,
      });
    }
  }
  return out;
}

// ===== E3: disclaimer ========================================================

export function checkDisclaimer(rule: KitRule, item: TextItem): FindingSeed[] {
  const text = item.text_content ?? "";
  if (!text) return [];
  const { trigger_terms, required_text } = payloadOf<{
    trigger_terms?: string[];
    required_text?: string;
  }>(rule);
  if (!required_text) return [];

  const triggers = (trigger_terms ?? []).filter((t) =>
    findOccurrences(text, t).length > 0,
  );
  if (triggers.length === 0) return [];
  if (text.toLowerCase().includes(required_text.toLowerCase())) return [];

  const first = findOccurrences(text, triggers[0])[0];
  return [
    {
      ...base(
        rule,
        "Missing required disclaimer",
        `The content mentions ${triggers.map((t) => `“${t}”`).join(", ")}, which requires ` +
          `the disclaimer “${required_text}” (rule “${rule.name}”), but it is not present.`,
      ),
      location: first
        ? { type: "text", ...first, excerpt: excerptAt(text, first.start, first.end) }
        : { type: "text" },
      suggested_fix: `Append the required disclaimer: “${required_text}”`,
    },
  ];
}

// ===== E5: alt_text_policy ===================================================

export function checkAltText(rule: KitRule, item: TextItem): FindingSeed[] {
  if (item.source_kind !== "image") return [];
  const { require_alt_text, min_length } = payloadOf<{
    require_alt_text?: boolean;
    min_length?: number;
  }>(rule);
  if (require_alt_text === false) return [];
  const min = typeof min_length === "number" ? min_length : 0;
  const alt = (item.alt_text ?? "").trim();

  if (alt.length === 0) {
    return [
      {
        ...base(
          rule,
          "Alt text missing",
          `Images must carry alt text so screen-reader users get the same ` +
            `information (rule “${rule.name}”).`,
        ),
        location: { type: "alt_text" },
        suggested_fix: `Write alt text describing the image (at least ${min} characters).`,
      },
    ];
  }
  if (alt.length < min) {
    return [
      {
        ...base(
          rule,
          "Alt text too short",
          `The alt text is ${alt.length} characters; rule “${rule.name}” requires at least ${min}.`,
        ),
        location: { type: "alt_text" },
        suggested_fix: `Extend the alt text to at least ${min} characters.`,
      },
    ];
  }
  return [];
}
