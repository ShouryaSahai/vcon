# Vcon — Measured evaluation

This is the methodology behind the numbers on the **`/evals`** page. The
recorded scorecard itself lives in [`src/lib/evals/results.json`](../src/lib/evals/results.json)
— it is machine-written by the eval suite, never hand-edited.

## What is measured

A **labeled eval set** (32 cases at time of writing) runs through the *real*
production checkers — the same functions the pipeline calls
(`src/lib/checks/deterministic.ts`, `color.ts`, `ai.ts`, `routing.ts`) —
completely in-memory: no database, no storage, no rate limiter, no demo-data
pollution.

Every case declares the **exact set of kit rules** it must flag:

- a rule expected but not flagged is a **miss**;
- a rule flagged but not expected is a **false flag**;
- a clean case producing any finding is a **false flag**.

## Exact attribution

Cases run per checker **family in isolation**:

- **deterministic** cases see only the five deterministic rules
  (banned terms ×2, disclaimer, alt-text policy, palette);
- **ai** cases see only the three grounded AI rules (approved claims, tone,
  terminology).

There is no cross-family noise, so a false flag is a real false flag. The
fixtures mirror [`supabase/seed.sql`](../supabase/seed.sql) — GlowNaturals
kit v1 — byte-for-byte (names, payloads, severities), so the scorecard
measures the product against its actual published contract.

## Honest failure is a fail

If the AI call degrades — rate limit, malformed output, unusable response —
the harness does **not** score the needs-human fallback as a pass: the case
fails and the run is rerun. The production system degrades honestly; the
eval harness refuses to paper over it.

## Aggregate metrics

- **Detection rate** — fraction of violation cases where every expected rule
  was flagged (and nothing extra).
- **False-flag rate** — fraction of clean cases that produced findings.
- **Citation rate** — fraction of findings citing a real kit rule
  (production additionally enforces this in code — an uncited AI finding is
  demoted to human review and never counted).
- **Latency** — per-case average, per family.

## Rerun

```bash
pnpm test:evals   # asserts every case AND rewrites results.json
```

Deterministic cases run on every `pnpm test` (instant, no quota). AI cases
make real Gemini calls, are paced to respect the model's rate limit, and run
only in the explicit eval command. The same free-tier quota serves the live
demo — run the eval suite well before a demo session, not right before it.
