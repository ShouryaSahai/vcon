import { describe, expect, it } from "vitest";

import {
  checkAltText,
  checkBannedTerms,
  checkDisclaimer,
  checkRequiredTerms,
  findOccurrences,
} from "./deterministic";
import type { KitRule } from "@/lib/db-types";

function rule(overrides: Partial<KitRule>): KitRule {
  return {
    id: "rule-1",
    kit_version_id: "ver-1",
    rule_type: "banned_term",
    name: "Test rule",
    payload: {},
    severity_default: "high",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as KitRule;
}

const textItem = {
  source_kind: "text" as const,
  text_content: "The miracle glow you need! 100% natural and clinically proven. Only from Glow Naturals.",
  alt_text: null,
};
const imageItem = (alt: string | null) => ({
  source_kind: "image" as const,
  text_content: null,
  alt_text: alt,
});

describe("findOccurrences", () => {
  it("matches case-insensitively with word boundaries", () => {
    expect(findOccurrences("A MIRACLE and a miracle", "miracle")).toHaveLength(2);
  });
  it("does not match inside longer words", () => {
    expect(findOccurrences("miraculously fine", "miracle")).toHaveLength(0);
  });
  it("matches multi-word phrases", () => {
    expect(findOccurrences("Chemical Free shampoo", "chemical free")).toHaveLength(1);
  });
});

describe("checkBannedTerms", () => {
  const banned = rule({
    rule_type: "banned_term",
    name: "Banned: miracle",
    payload: { terms: ["miracle", "miraculous"] },
  });

  it("flags each occurrence with rule citation and location", () => {
    const findings = checkBannedTerms(banned, textItem);
    expect(findings).toHaveLength(1);
    expect(findings[0].kit_rule_id).toBe("rule-1");
    expect(findings[0].source).toBe("rule_engine");
    expect(findings[0].title).toContain("miracle");
    const loc = findings[0].location as { start: number; end: number; excerpt: string };
    expect(textItem.text_content.slice(loc.start, loc.end).toLowerCase()).toBe("miracle");
    expect(loc.excerpt).toContain("glow");
  });

  it("returns nothing for clean text", () => {
    expect(
      checkBannedTerms(banned, { ...textItem, text_content: "A lovely glow." }),
    ).toHaveLength(0);
  });
});

describe("checkRequiredTerms", () => {
  const required = rule({
    rule_type: "required_term",
    name: "Include patch test advice",
    payload: { terms: ["patch test"] },
  });

  it("flags when the required term is absent", () => {
    const findings = checkRequiredTerms(required, textItem);
    expect(findings).toHaveLength(1);
    expect(findings[0].suggested_fix).toContain("patch test");
  });

  it("passes when present", () => {
    expect(
      checkRequiredTerms(required, { ...textItem, text_content: "Do a patch test first." }),
    ).toHaveLength(0);
  });
});

describe("checkDisclaimer", () => {
  const disclaimer = rule({
    rule_type: "disclaimer",
    name: "Disclaimer with performance claims",
    payload: { trigger_terms: ["clinically proven"], required_text: "Results may vary" },
  });

  it("flags trigger without the disclaimer (E3)", () => {
    const findings = checkDisclaimer(disclaimer, textItem);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Missing required disclaimer");
    expect(findings[0].suggested_fix).toContain("Results may vary");
  });

  it("passes when the disclaimer is present", () => {
    expect(
      checkDisclaimer(disclaimer, {
        ...textItem,
        text_content: "Clinically proven. Results may vary.",
      }),
    ).toHaveLength(0);
  });

  it("passes when no trigger term is present", () => {
    expect(
      checkDisclaimer(disclaimer, { ...textItem, text_content: "A lovely glow." }),
    ).toHaveLength(0);
  });
});

describe("checkAltText", () => {
  const policy = rule({
    rule_type: "alt_text_policy",
    name: "Alt text required",
    payload: { require_alt_text: true, min_length: 20 },
  });

  it("flags missing alt text (E5)", () => {
    const findings = checkAltText(policy, imageItem(null));
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Alt text missing");
  });

  it("flags too-short alt text", () => {
    const findings = checkAltText(policy, imageItem("a bottle"));
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Alt text too short");
  });

  it("passes with adequate alt text", () => {
    expect(checkAltText(policy, imageItem("A product bottle on a sage background."))).toHaveLength(0);
  });

  it("ignores text items", () => {
    expect(checkAltText(policy, textItem)).toHaveLength(0);
  });
});
