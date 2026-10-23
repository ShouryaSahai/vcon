import { describe, expect, it } from "vitest";

import { runAiChecks, type AiCaller } from "./ai";
import type { KitRule } from "@/lib/db-types";

const claimRule = {
  id: "rule-c12",
  kit_version_id: "ver-1",
  rule_type: "approved_claim",
  name: "Approved claims (C-12)",
  payload: {
    allowed: ["made with natural ingredients"],
    explicitly_disallowed: ["100% natural"],
  },
  severity_default: "high",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
} as KitRule;

const toneRule = {
  ...claimRule,
  id: "rule-tone",
  rule_type: "tone_guideline",
  name: "Voice: warm, plain-spoken",
  payload: { voice: "Warm, plain-spoken, no hype.", avoid: ["ALL-CAPS words"] },
} as KitRule;

const item = { context_type: "instagram_post", text_content: "Our 100% natural cream is AMAZING!!!" };

const validOutput = {
  findings: [
    {
      rule_ref: "Approved claims (C-12)",
      title: "Claim not in approved library",
      explanation: "The caption says 100% natural, which is disallowed.",
      severity: "high",
      confidence: 0.92,
      suggested_fix: "Use made with natural ingredients instead.",
    },
  ],
};

describe("runAiChecks", () => {
  it("keeps findings whose citations resolve to real rules", async () => {
    const call: AiCaller = async () => validOutput;
    const seeds = await runAiChecks([claimRule], item, { call });
    expect(seeds).toHaveLength(1);
    expect(seeds[0].kit_rule_id).toBe("rule-c12");
    expect(seeds[0].source).toBe("ai");
    expect(seeds[0].confidence).toBe(0.92);
    expect(seeds[0].needs_human).toBe(false);
  });

  it("downgrades uncited findings to needs_human with no citation", async () => {
    const call: AiCaller = async () => ({
      findings: [
        {
          rule_ref: "Rule that does not exist",
          title: "Invented rule flag",
          explanation: "Cites nothing real.",
          severity: "medium",
          confidence: 0.8,
          suggested_fix: "N/A",
        },
      ],
    });
    const seeds = await runAiChecks([claimRule], item, { call });
    expect(seeds).toHaveLength(1);
    expect(seeds[0].kit_rule_id).toBeNull();
    expect(seeds[0].needs_human).toBe(true);
    expect(seeds[0].assigned_to_role).toBe("reviewer");
    expect(seeds[0].explanation).toContain("does not exist");
  });

  it("retries once when the first call throws", async () => {
    let calls = 0;
    const call: AiCaller = async () => {
      calls += 1;
      if (calls === 1) throw new Error("malformed JSON");
      return validOutput;
    };
    const seeds = await runAiChecks([claimRule], item, { call });
    expect(calls).toBe(2);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].kit_rule_id).toBe("rule-c12");
  });

  it("returns one needs_human finding after two unusable calls", async () => {
    const call: AiCaller = async () => {
      throw new Error("still broken");
    };
    const seeds = await runAiChecks([claimRule], item, { call });
    expect(seeds).toHaveLength(1);
    expect(seeds[0].title).toBe("AI check could not complete");
    expect(seeds[0].needs_human).toBe(true);
    expect(seeds[0].kit_rule_id).toBeNull();
  });

  it("returns needs_human when output fails the schema twice", async () => {
    let calls = 0;
    const call: AiCaller = async () => {
      calls += 1;
      return { findings: "not an array" }; // schema-invalid, no throw
    };
    const seeds = await runAiChecks([claimRule], item, { call });
    expect(calls).toBe(2);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].needs_human).toBe(true);
  });

  it("does nothing without a caller or credentials", async () => {
    const seeds = await runAiChecks([claimRule], item);
    expect(seeds).toHaveLength(0);
  });

  it("passes all kit rules and the content in the prompt", async () => {
    let seen = "";
    const call: AiCaller = async ({ prompt }) => {
      seen = prompt;
      return { findings: [] };
    };
    await runAiChecks([claimRule, toneRule], item, { call });
    expect(seen).toContain("Approved claims (C-12)");
    expect(seen).toContain("Voice: warm, plain-spoken");
    expect(seen).toContain("100% natural");
  });
});
