import type { KitRule } from "@/lib/db-types";

import { runAiChecks } from "@/lib/checks/ai";
import { checkAltText, checkBannedTerms, checkDisclaimer, checkRequiredTerms, type FindingSeed } from "@/lib/checks/deterministic";
import { checkBrandColor, type RasterImage } from "@/lib/checks/color";
import { routeFinding } from "@/lib/checks/routing";

import { AI_RULES, DETERMINISTIC_RULES, EVAL_CASES, type EvalCase } from "./cases";

/**
 * The eval harness. Runs each labeled case through the SAME checker functions
 * the production pipeline uses (`src/lib/checks/*`) — completely in-memory:
 * no database, no storage, no rate limits, no demo-data pollution. Only the
 * kit fixture and the case content go in; findings come out.
 *
 * Cases run per family in isolation (deterministic rules only / AI rules
 * only), so attribution is exact: a rule cited that was not expected is a
 * false flag, an expected rule missing is a miss.
 */

export type EvalFinding = {
  rule: string | null;
  severity: string;
  confidence: number | null;
  needsHuman: boolean;
  routedTo: string;
};

export type CaseResult = {
  id: string;
  family: EvalCase["family"];
  title: string;
  notes?: string;
  ok: boolean;
  expected: string[];
  flagged: string[];
  missing: string[];
  extras: string[];
  findings: EvalFinding[];
  latencyMs: number;
  /** AI-only: the run degraded to a needs-human finding (still honest, but not a score) */
  degraded?: boolean;
};

export type EvalResults = {
  meta: {
    when: string;
    model: string;
    aiEnabled: boolean;
    cases: number;
  };
  totals: {
    pass: number;
    fail: number;
    detectionRate: number; // fraction of violation cases with all expected rules flagged
    falseFlagRate: number; // fraction of clean cases that produced findings
    citationRate: number; // fraction of findings citing a real kit rule
    avgLatencyMs: { deterministic: number; ai: number };
  };
  cases: CaseResult[];
};

/** Builds the solid-color RGBA raster the palette checker consumes. */
function solidImage(hex: string): RasterImage {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width: size, height: size, data };
}

function ruleNameById(rules: KitRule[]): Map<string, string> {
  return new Map(rules.map((r) => [r.id, r.name]));
}

/** Deterministic family — mirrors run.ts's loop, minus the DB. */
function runDeterministic(caseDef: EvalCase, rules: KitRule[]): FindingSeed[] {
  const item = {
    source_kind: caseDef.source_kind,
    text_content: caseDef.text_content,
    alt_text: caseDef.alt_text,
  };
  const image = caseDef.source_kind === "image" && caseDef.imageColor ? solidImage(caseDef.imageColor) : null;

  const seeds: FindingSeed[] = [];
  for (const rule of rules) {
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
      case "brand_color":
        if (image) seeds.push(...checkBrandColor(rule, image));
        break;
    }
  }
  return seeds;
}

/** AI family — the real Gemini path (grounded prompt + code-enforced citations). */
async function runAi(caseDef: EvalCase, rules: KitRule[]): Promise<{ seeds: FindingSeed[]; degraded: boolean }> {
  const result = await runAiChecks(rules, {
    context_type: caseDef.context_type,
    text_content: caseDef.text_content,
  });
  // The needs-human degradation finding is honest failure, not a score.
  const degraded = result.status === "failed";
  return { seeds: result.seeds, degraded };
}

function routeSeeds(seeds: FindingSeed[], rules: KitRule[]): EvalFinding[] {
  const byId = ruleNameById(rules);
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  return seeds.map((seed) => {
    const rule = seed.kit_rule_id ? ruleById.get(seed.kit_rule_id) : undefined;
    const routing = routeFinding(rule?.rule_type ?? "custom", seed.confidence ?? null);
    return {
      rule: seed.kit_rule_id ? (byId.get(seed.kit_rule_id) ?? null) : null,
      severity: seed.severity ?? "medium",
      confidence: seed.confidence ?? null,
      needsHuman: seed.needs_human || routing.needs_human,
      routedTo: seed.kit_rule_id === null ? "reviewer" : routing.assigned_to_role,
    };
  });
}

/** Runs one case. `aiEnabled` gates Gemini calls (no key → AI cases skipped upstream). */
export async function runEvalCase(caseDef: EvalCase, aiEnabled: boolean): Promise<CaseResult> {
  const rules = caseDef.family === "deterministic" ? DETERMINISTIC_RULES : AI_RULES;
  const startedAt = performance.now();

  let seeds: FindingSeed[] = [];
  let degraded: boolean | undefined;
  if (caseDef.family === "deterministic") {
    seeds = runDeterministic(caseDef, rules);
  } else if (aiEnabled) {
    const r = await runAi(caseDef, rules);
    seeds = r.seeds;
    degraded = r.degraded;
  }

  const findings = routeSeeds(seeds, rules);
  const flagged = [...new Set(findings.map((f) => f.rule).filter((r): r is string => r !== null))];
  const missing = caseDef.expect.filter((name) => !flagged.includes(name));
  const extras = flagged.filter((name) => !caseDef.expect.includes(name));
  const ok = missing.length === 0 && extras.length === 0 && !degraded;

  return {
    id: caseDef.id,
    family: caseDef.family,
    title: caseDef.title,
    notes: caseDef.notes,
    ok,
    expected: caseDef.expect,
    flagged,
    missing,
    extras,
    findings,
    latencyMs: Math.round(performance.now() - startedAt),
    degraded,
  };
}

/** Aggregates case results into the scorecard. */
export function aggregate(results: CaseResult[], aiEnabled: boolean): EvalResults {
  const violationCases = results.filter((r) => r.expected.length > 0);
  const cleanCases = results.filter((r) => r.expected.length === 0);
  const detected = violationCases.filter((r) => r.missing.length === 0 && r.extras.length === 0).length;
  const cleanPassed = cleanCases.filter((r) => r.extras.length === 0).length;
  const allFindings = results.flatMap((r) => r.findings);
  const cited = allFindings.filter((f) => f.rule !== null).length;

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

  return {
    meta: {
      when: new Date().toISOString(),
      model: aiEnabled ? (process.env.GEMINI_MODEL ?? "gemini-3.5-flash") : "(deterministic only)",
      aiEnabled,
      cases: results.length,
    },
    totals: {
      pass: results.filter((r) => r.ok).length,
      fail: results.filter((r) => !r.ok).length,
      detectionRate: violationCases.length ? detected / violationCases.length : 1,
      falseFlagRate: cleanCases.length ? 1 - cleanPassed / cleanCases.length : 0,
      citationRate: allFindings.length ? cited / allFindings.length : 1,
      avgLatencyMs: {
        deterministic: avg(results.filter((r) => r.family === "deterministic").map((r) => r.latencyMs)),
        ai: avg(results.filter((r) => r.family === "ai").map((r) => r.latencyMs)),
      },
    },
    cases: results,
  };
}

/** Runs the whole labeled set and aggregates the scorecard. */
export async function runAllEvals(opts?: { ai?: boolean; filter?: (c: EvalCase) => boolean }): Promise<EvalResults> {
  const aiEnabled = opts?.ai ?? Boolean(process.env.GEMINI_API_KEY);
  const cases = opts?.filter ? EVAL_CASES.filter(opts.filter) : EVAL_CASES;

  const results: CaseResult[] = [];
  for (const caseDef of cases) {
    if (caseDef.family === "ai" && !aiEnabled) continue;
    results.push(await runEvalCase(caseDef, aiEnabled));
  }
  return aggregate(results, aiEnabled);
}
