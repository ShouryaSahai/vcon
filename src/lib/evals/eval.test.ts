import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { CaseResult } from "./harness";
import { EVAL_CASES } from "./cases";
import { aggregate, runEvalCase } from "./harness";

// Vitest does not load .env.local; the harness needs the real Gemini key for
// the AI family (same env the production server reads).
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/**
 * The labeled eval set is a TEST: every case must hold, or the scorecard is a
 * lie. Deterministic cases always run (instant, no quota). AI cases run real
 * Gemini calls only in `pnpm test:evals` (EVAL_AI=1) — they are paced to stay
 * inside the model's rate limit, and their results are shared with the
 * scorecard so every case runs exactly once.
 */

const runAiCases = process.env.EVAL_AI === "1";
const shared: CaseResult[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("deterministic eval cases", () => {
  for (const caseDef of EVAL_CASES.filter((c) => c.family === "deterministic")) {
    it(`${caseDef.id} — ${caseDef.title}`, async () => {
      const result = await runEvalCase(caseDef, false);
      shared.push(result);
      expect(result.missing, `missed: ${result.missing}`).toEqual([]);
      expect(result.extras, `false flags: ${result.extras}`).toEqual([]);
      expect(result.ok).toBe(true);
    });
  }
});

describe.skipIf(!runAiCases)("ai eval cases (Gemini)", () => {
  for (const caseDef of EVAL_CASES.filter((c) => c.family === "ai")) {
    it(`${caseDef.id} — ${caseDef.title}`, async () => {
      await sleep(6500); // pace: stay inside the model's per-minute rate limit
      const result = await runEvalCase(caseDef, true);
      shared.push(result);
      expect(result.degraded, "AI run degraded to needs-human — rate limit or bad output; rerun").toBeFalsy();
      expect(result.missing, `missed: ${result.missing}`).toEqual([]);
      expect(result.extras, `false flags: ${result.extras}`).toEqual([]);
      expect(result.ok).toBe(true);
    });
  }
});

describe("scorecard", () => {
  it("aggregates the run", async () => {
    // Deterministic cases run in the suite above; if AI was enabled those ran
    // too. Rerun only what is missing so the scorecard covers the full set.
    const have = new Set(shared.map((r) => r.id));
    for (const caseDef of EVAL_CASES) {
      if (have.has(caseDef.id)) continue;
      if (caseDef.family === "ai" && !runAiCases) continue;
      shared.push(await runEvalCase(caseDef, runAiCases));
    }
    const results = aggregate(shared, runAiCases);
    expect(results.cases.length).toBeGreaterThanOrEqual(20);
    expect(results.totals.fail).toBe(0);
    expect(results.totals.detectionRate).toBe(1);
    expect(results.totals.falseFlagRate).toBe(0);
    expect(results.totals.citationRate).toBe(1);
  });

  it.runIf(process.env.EVAL_WRITE === "1")("writes the committed results.json", async () => {
    const results = aggregate(shared, runAiCases);
    writeFileSync(resolve(import.meta.dirname, "results.json"), JSON.stringify(results, null, 2) + "\n");
    console.log(`results.json: ${results.totals.pass}/${results.cases.length} cases · model ${results.meta.model}`);
  });
});
