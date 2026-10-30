# Vcon

**Pre-publication brand governance for marketing content.** Vcon checks text and images against a versioned brand kit before they go public. Every finding should explain the issue, cite its rule, and route decisions to a human.

**Live app:** https://vcon-six.vercel.app  
**Demo data:** synthetic GlowNaturals examples only.  
**License:** [MIT](./LICENSE).

See [PLAN.md](./PLAN.md) for a concise project overview and verification caveats, and [docs/acceptance.md](./docs/acceptance.md) for the seeded acceptance matrix.

## Features

- Versioned brand kits and rules for claims, tone, terminology, disclaimers, banned/required terms, colours, and alt text.
- Deterministic checks plus grounded AI-assisted checks.
- Findings with explanations, locations, cited rules, confidence where available, and suggested fixes.
- Creator, reviewer, and approver workflow with comments, decision history, and linked resubmissions.
- Private image storage, image-size/dimension checks, and rate limiting for check requests.
- Synthetic sample brand data; no customer material is required for the demo.

## Stack

- **Next.js 16** App Router, TypeScript, Tailwind CSS
- **Supabase** Postgres, Auth, and private Storage
- **Gemini** for server-side AI-assisted checks
- **Vercel** hosting
- **pnpm**, ESLint, and Vitest

## Quickstart — local development

Prerequisites: Node.js, pnpm, Docker, and the Supabase CLI.

```bash
pnpm install
supabase start
supabase db reset
cp .env.example .env.local
```

Use the local Supabase URL and publishable/anon key reported by `supabase status` to fill `.env.local`. Add a Gemini API key only if you want to exercise the AI-assisted checks. Keep all real credentials in the ignored local env file; never commit it.

Run the app:

```bash
pnpm dev
```

Open http://localhost:3000. The local database reset applies the migrations and seed data.

## Hosted Supabase setup

For a new hosted database, apply these files in order in the Supabase SQL editor, then run the seed:

1. [Migration 0001 — schema and RLS](./supabase/migrations/0001_init.sql)
2. [Migration 0002 — image upload limit](./supabase/migrations/0002_image_limits.sql)
3. [Migration 0003 — database role enforcement](./supabase/migrations/0003_role_enforcement.sql)
4. [Seed data](./supabase/seed.sql)

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the client. Set `GEMINI_API_KEY` and `GEMINI_MODEL` as server-side environment variables for AI checks. A service-role secret, if used for trusted server operations, must remain server-side and must never be prefixed with `NEXT_PUBLIC_`.

**Important:** as of the last recorded check on 25 October 2026, migration 0003 was in GitHub but had not yet been applied to the hosted Supabase project. Do not assume its database-level role guards are active until that migration is applied and verified in the hosted environment.

## Upload safety

1. Browser checks reject empty, oversized, or unsupported images before submission.
2. The private Storage bucket has a 10 MB file cap when migration 0002 is applied.
3. PNG/JPEG dimensions are probed from headers before image decoding (10 MB, 30 megapixels, 12,000 px per side).
4. Rejected images produce an explicit needs-human/incomplete result rather than being silently accepted.

## Security model

- New signups default to the creator role and do not gain a workspace or elevated role from client metadata.
- RLS policies scope normal data access by workspace.
- Database write guards are defined in migration 0003; apply and verify it in the hosted database before relying on those extra protections.
- AI and Supabase secrets stay server-side in environment variables.
- `.env*` files are ignored; only the blank `.env.example` is intentionally tracked.
- The check endpoint uses a per-user in-memory rate limit. It is a demo safeguard, not a distributed quota system.

## Deployment

The current project has been deployed separately from GitHub pushes; a push to `main` does not by itself prove that the live app was updated. Before a demo, verify the intended commit is deployed, sign in, test authenticated `/items`, `/review`, and `/upload`, and inspect fresh runtime logs.

A Next.js `Date.now()` prerender error was previously observed in the hosted auth/session path. A full authenticated smoke test against the hosted app passed on 25 October 2026 (sign-up → session → authenticated `/items`, `/review`, `/kit`, and `/upload` all returned 200 with correct role-gated content), clearing that error for the deployed revision. Re-run the smoke test after deploying new commits.

The optional `NEXT_PUBLIC_DEMO_EMAIL` and `NEXT_PUBLIC_DEMO_PASSWORD` variables display a one-click demo card only when both are configured. Use a dedicated demo-only account with synthetic data. Those values are intentionally visible to browser users and must never represent a personal account.

## Project structure

```
supabase/
  migrations/0001_init.sql
  migrations/0002_image_limits.sql
  migrations/0003_role_enforcement.sql
  seed.sql
  bootstrap.sql
  verify/0003_role_enforcement.sh
src/
  app/             Next.js routes and API handlers
  components/      UI components
  lib/checks/      deterministic and AI-assisted check pipeline
  lib/supabase/    browser/server/proxy clients
docs/
  acceptance.md    seeded acceptance test matrix and recorded run
PLAN.md            project summary, migration order, release caveats
LICENSE            MIT license
```

## Measured evaluation

The claims are backed by a labeled eval set: 32 cases run through the real
production checkers, per family in isolation, with exact attribution — a miss
is a miss and a false flag is a false flag. The committed scorecard lives in
`src/lib/evals/results.json` (machine-written by `pnpm test:evals`, never
hand-edited), renders on the in-app **`/evals`** page, and the methodology is
documented in [docs/evals.md](./docs/evals.md). The eval set runs as part of
the test suite, so the numbers cannot drift silently.

## Verification

The latest checks recorded by the development environment on 25 October 2026 were lint clean, 41/41 tests passed, and production build successful. The local migration 0003 verification script reported 30/30 cases passed. These historical results do not replace a fresh check after code changes or a smoke test against the current hosted deployment.

```bash
pnpm lint
pnpm test
pnpm build
git diff --check
```

## Round 3 update

**Verified status**

- **Evaluation:** 32 labeled cases (20 deterministic, 12 AI), all passing in the latest recorded run on `gemini-3.5-flash-lite`. Scorecard: `/evals` (data in `src/lib/evals/results.json`); rerun with `pnpm test:evals`. AI cases call a live model, so results can vary between runs; we saw occasional single-case flakiness (timeout or a differing answer) during development, and the committed scorecard is the latest recorded run.
- **AI providers:** Gemini is the working provider. A second provider path (NVIDIA) exists in `src/lib/checks/ai.ts`, but its default model (`meta/llama-3.3-70b-instruct`) currently returns HTTP 410 (retired upstream), so it is not used. Fixing it is an open issue for contributors.
- **PDF upload:** text-based PDFs can be uploaded on `/upload`; the text is extracted server-side (`/api/extract-pdf`) and the same deterministic and AI checks run as for pasted text. Tested end to end on a 4-page PDF.
- **Color and accessibility:** palette matching uses CIEDE2000 (`src/lib/checks/color.ts`); `/kit` shows a WCAG contrast report for every pair of approved palette colors (`src/lib/checks/contrast.ts`, unit-tested).
- **Insights:** `/insights` shows findings by rule plus a guideline-health view (flag counts, override rates, a "Possibly unclear" label for rules people override often).
- **Judge demo:** `/login` has a one-click "Try the demo" button.

**Known limitations**

- Scanned (image-only) PDFs are not supported; DOCX upload is not supported.
- Findings from PDFs do not yet point to a page or section.
- The contrast check is a kit-level report, not a per-item finding.
- No readability score yet; vague rules are surfaced through override rates, not an AI measurability check.
- NVIDIA provider path needs a current default model (see above).
