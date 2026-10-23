# Vcon — Round 2 Build Plan (v2)

Owner: Shourya Sahai (tech lead, solo build) · Date: 23 Oct 2026
Source: Round 1 submission (Team CON-V), revised after plan re-review.

## 1. What changed after re-review (v1 → v2)

1. **Vercel AI SDK replaces a hand-rolled provider layer.** One interface for Gemini now and OpenRouter later, with zod-based structured output built in. Less code, same design goal.
2. **Explicit status machines** for content items and findings (Section 5). Undefined states are where solo builds stall.
3. **Schema is now column-level** (Section 4) so it can be vetoed now instead of migrated later.
4. **Bounded screen list** (Section 6) — the UI surface is fixed at 6 screens.
5. **Testing slice added** (Section 9) — unit tests for the pure functions only (deterministic checkers, citation enforcement). Cheap, and it backs the "reliability" story with evidence.
6. **Timeboxes + an ordered cut-list** (Section 8) — the cut-list is the scope contract if time runs short.
7. **Alt text becomes an upload input** — presence check is deterministic, quality check is AI. Small decision, makes a Round 1 requirement actually checkable.
8. Prior cuts confirmed: rule extraction = prefill stretch goal only; one AI provider until it works; no queue infrastructure; docx late, PDF optional.

## 2. Scope for Round 2

**In:** text + image first-class; brand kit via structured forms with versioning; deterministic checks; grounded AI checks with citations, confidence and "no source found"; findings UI (what/where/why/rule/fix); routing tags by type + confidence; roles, decisions, comments, history, resubmission; seeded synthetic skincare kit.

**Out:** rule extraction prefill (stretch); insights view (Round 3); accessibility/contrast checks (Round 3); video and audio; direct publishing; automatic image editing; second AI provider (interface only); specialist sub-queue screens.

## 3. Architecture

- Next.js (App Router, TypeScript strict) on Vercel. App scaffolded at the `UPSTART` root.
- Supabase: Postgres + Auth + Storage. Every mutation re-checks role server-side; RLS on every table scoped by `workspace_id`.
- Uploads go direct from client to Storage (signed upload). After upload the client calls `POST /api/checks`, which runs the whole pipeline and writes findings; the UI polls item status. No external queue.
- All AI calls run server-side only. Keys in `.env.local`, never committed.
- One runner: `runChecks(contentItemId)` → load kit version → deterministic checks → AI check → write findings + update status. Failed runs set `status=failed` with a retry button.

## 4. Data model

| Table | Key columns |
|---|---|
| `workspaces` | id, name, created_by |
| `profiles` | id (= auth.users.id), workspace_id, full_name, role: admin \| creator \| approver \| reviewer |
| `brand_kits` | id, workspace_id, name, current_version_id |
| `kit_versions` | id, kit_id, version_number, status: draft \| published, published_at |
| `kit_rules` | id, kit_version_id, rule_type: banned_term \| required_term \| approved_claim \| brand_color \| tone_guideline \| disclaimer \| alt_text_policy \| custom, name, payload jsonb, severity_default, is_active |
| `content_items` | id, workspace_id, kit_version_id, created_by, context_type (instagram_post \| blog \| ad …), source_kind: text \| image \| docx, storage_path, text_content, alt_text, status, parent_item_id (resubmission link) |
| `checks` | id, content_item_id, status: queued \| running \| done \| failed, started_at, finished_at, error, summary jsonb |
| `findings` | id, check_id, content_item_id, kit_rule_id, source: rule_engine \| ai, title, explanation, location jsonb, severity, confidence, suggested_fix, assigned_to_role: creator \| reviewer, needs_human bool, status |
| `comments` | id, content_item_id, finding_id nullable, author_id, body, created_at |
| `decision_log` | id, content_item_id, finding_id nullable, actor_id, action: approved \| returned \| fix_accepted \| fix_rejected \| override, reason, created_at |

- Single `kit_rules` table with a typed `payload` jsonb — one schema for all rule types, no per-type migrations.
- History = `decision_log` + `comments`, append-only.

## 5. Status machines

- `content_items.status`: uploaded → checking → needs_changes → in_review → approved · returned · failed
- `findings.status`: open → fix_accepted · fix_rejected · overridden · needs_human
- Resubmission creates a new `content_items` row with `parent_item_id` set and re-runs checks against the same kit version.

## 6. Screens (fixed set)

1. `/login` — Supabase auth, role from profile
2. `/kit` — rules by type, add/edit/deactivate, publish new version (draft → confirm → published)
3. `/upload` — context + text or image (+ alt text for images)
4. `/items` — list with status badges
5. `/items/[id]` — the core screen: preview, findings (what/where/why/rule/fix/confidence/needs_human), accept/reject fix (creator), approve/return/override with reason (reviewer), comments, history, kit version shown
6. `/review` — reviewer queue: items in review + findings assigned to reviewer role

## 7. Checkers

**Deterministic (run first):** banned terms (word-boundary match); required terms/disclaimers present per context type; image palette vs approved colours (dominant-colour extraction + delta-E threshold); alt text present.

**AI (Gemini, one call, all kit rules in prompt, zod-validated JSON):** tone vs tone guideline; claim wording vs approved claims; terminology vs glossary; alt-text quality.

**Citation enforcement (code, not prompt):** every AI finding must cite a `kit_rule_id` that exists in the checked kit version. Missing citation → downgraded to `needs_human` or dropped. Malformed output → one retry → `needs_human`.

## 8. Milestones, timeboxes, cut-list

| # | Milestone | Done when | Timebox |
|---|---|---|---|
| M0 | Scaffold, deploy, auth + roles | Two roles sign in, live URL | 0.5–1 d |
| M1 | Schema + RLS + seed | Seed script creates skincare kit v1 with seeded errors; acceptance script drafted | 1 d |
| M2 | Kit UI | Admin edits rules and publishes v2 | 1 d |
| M3 | Upload + status | Text + image upload, "checking" visible | 0.5–1 d |
| M4 | Deterministic checks | Every seeded error flagged with its rule cited | 1–1.5 d |
| M5 | Findings UI | Finding shows what/where/why/rule/fix | 1 d |
| M6 | AI checks + citation enforcement | AI finding cites a rule or is needs_human; malformed output rejected | 1.5–2 d |
| M7 | Decisions + history | Accept/reject, approve/return, override with reason; resubmission re-checks | 1.5–2 d |
| M8 | Routing + role gating | Claims finding lands in reviewer queue; creator cannot approve | 0.5 d |
| M9 | Demo run + backup recording | One post: upload → approval, no manual fixes | 1 d |

Total: ~9–12 focused days.

**Cut-list, in order, if behind:** docx support → alt-text AI quality check → unit tests beyond the citation validator → specialist assignment granularity. **Never cut:** M0–M6 core path, M9 backup recording.

## 9. Testing

Vitest unit tests for pure functions only: banned-term matcher, disclaimer checker, colour delta-E, citation-enforcement validator, output schema validation. One integration test for the pipeline with the AI stubbed by a fixture. No E2E framework.

## 10. Locked decisions (defaults — veto anything)

- pnpm, Next.js App Router, TypeScript strict
- Tailwind + shadcn/ui
- Vercel AI SDK with the Google provider; OpenRouter provider added later behind the same interface
- zod schemas shared between API validation and UI
- Conventional commits, feature branches, squash to main
- Only synthetic/sample brand material; API keys in env vars

## 11. Risks

| Risk | Mitigation |
|---|---|
| Vercel Hobby function timeout on slow AI calls | Keep demo files small; `failed` status + retry button |
| Gemini rate limit / outage | Deterministic checks unaffected; add OpenRouter provider when core works |
| Supabase free tier pauses when idle | Wake project before every demo session |
| Scope creep | Cut-list in Section 8 is the contract |

## 12. Open questions (veto window)

1. Single `kit_rules` table with jsonb payload — approve, or one table per rule type?
2. Alt text typed by the creator at upload — acceptable?
3. Vercel AI SDK as the provider layer — approve?
4. Keep rule extraction out of Round 2 (prefill later) — confirm?
5. Real deadline from the organisers? The ~9–12 day estimate flexes around it.

## 13. Progress log

- **23 Oct 2026 — M0 code complete; live verification pending his Supabase project.**
  - Next.js 16.4.2 scaffold. Two Next 16 changes handled: `middleware.ts` → `src/proxy.ts` (deprecated), and Cache Components default — session-reading routes use `export const instant = false` for now (documented opt-out; convert to Suspense patterns later, one route at a time).
  - **Security correction applied (Shourya, pre-build):** signup always creates `role='creator'` with `workspace_id=NULL`; no role metadata from the client; no auto-join of a shared demo workspace. Elevation only via `supabase/bootstrap.sql` (project owner) or in-app admin actions (M8). RLS unchanged as the enforcement point.
  - `supabase/migrations/0001_init.sql`: full schema (§4), RLS on every table, new-user trigger, private `content` storage bucket with workspace-scoped path policies.
  - Auth wired: sign-in/sign-up (no role picker, by design), proxy route guard, `/auth/callback` + `/auth/signout` route handlers, shell with role badge and workspace-status notice.
  - shadcn/ui initialized (base-nova preset on Base UI) + button/card/input/label/badge/textarea/select/tabs for upcoming screens.
  - Verified: `pnpm build` green; `/login` and `/` render correctly with no env configured (graceful setup banners); signout route is POST-only (405 on GET).
  - Remaining for M0 done-when: he creates the Supabase project, runs migration + bootstrap, signs in two roles, deploys to Vercel.

- **23 Oct 2026 — M1 complete (code side; final run against his Supabase project pending).**
  - `supabase/seed.sql`: GlowNaturals kit v1, published, 8 rules — 5 deterministic-checker contracts (palette, 2 banned terms, disclaimer, alt text) and 3 AI-checker contracts (approved claims C-12, tone, terminology). Idempotent; attaches to the workspace bootstrap created; payload shapes are the contract M4/M6 parse.
  - `src/lib/db-types.ts`: hand-mapped `Database` types mirroring the migration (Rows, Inserts, Updates, enums, rule-payload interfaces); wired into both Supabase clients. Regenerate via CLI once project is linked.
  - `docs/acceptance.md`: full-run script (upload → findings → decisions → approval), seeded-error matrix E1–E7 with expected rule citations, negative control, measures sheet, edge cases.
  - Verification without a live database: careful review against the migration (columns, types, defaults). Residual risk: seed/typing drift until first run — first thing to check when the Supabase project exists.
  - supabase-js 2.118 typing gotchas discovered while wiring the hand-mapped types (relevant when regenerating via CLI): every table needs `Relationships: []`, and Rows/Inserts must be `type` aliases, not `interface`s (index-signature constraint `Record<string, unknown>`). Build verified green with typed queries.

- **23 Oct 2026 — M2 (kit UI) built; M0/M1 verified end-to-end on a local Supabase stack.**
  - `/kit` built and verified: admin editor with draft-edit-publish flow, creator read-only view, outsider "no workspace" notice — rendered per-role against real seeded data.
  - Local stack: Docker via Colima (supabase CLI needs `DOCKER_HOST=unix:///<socket>` when the daemon is not at the default socket); `supabase db reset` applies migration + runs seed.sql automatically.
  - **Security evidence (REST-level, with the new sb_publishable keys):** signup → profile `creator` + unassigned for every user (client metadata ignored); outsider reads 0 kit rules and only their own profile; creator reads 8 rules but write → 403 `42501` RLS; admin reads 8 rules and 2 workspace profiles (not the outsider).
  - **Hardening added:** DB trigger `kit_rules_draft_only` — rule mutations against a published version now fail at the database level (verified: admin REST insert into published v1 → `P0001` "published and immutable"), not just in the app layer. Seed restructured to insert rules as draft, then publish.
  - Gotchas recorded: `psql -c` with multiple statements = one transaction (an error rolls back the whole batch); `auth.users` also has a `role` column (qualify `p.role` in joins).
  - Remaining for M0 done-when: Vercel live URL (needs his GitHub/Vercel accounts, or a Vercel token). Next: M3 upload + status.

- **23 Oct 2026 — M3 complete and verified end to end on the local stack.**
  - Upload flow (context + text/image, direct-to-storage, alt text required for images), `/items` list, `/items/[id]` detail with signed-image preview and check history, `POST /api/checks`, and `src/lib/checks/run.ts` pipeline shell (M4/M6 slots marked).
  - Live evidence: creator REST insert (RLS-scoped) → image uploaded to private bucket (200) → check API → `checks done`, items `in_review`; `/items` + `/items/[id]` render for creator; outsider POST /api/checks on creator's item → 404 (RLS through the app API); signed image preview renders.
  - **Bug caught by verification:** storage keys were built as `content/<ws>/…` inside a bucket already named `content` — browser uploads would have violated the workspace RLS policy. Fixed to `<ws>/<item>/<file>`; convention documented here: `storage_path` is the key INSIDE the bucket.
  - Tooling notes: PostgREST 13 defaults to `return=minimal` (send `Prefer: return=representation` to get inserted rows); React SSR interleaves `<!-- -->` between JSX expressions (grep rendered pages for contiguous strings only); bash `UID` is readonly.
  - Next: M4 deterministic checkers (banned terms, disclaimer, palette, alt-text presence) against the seeded-error matrix in docs/acceptance.md.

- **23 Oct 2026 — M4 complete: deterministic checkers live and verified.**
  - Five deterministic checkers shipped: banned_term, required_term, disclaimer, alt_text_policy, brand_color (dominant colour vs approved palette, CIE76 ΔE). Pure functions + 23 vitest unit tests (plan §9 testing slice started).
  - Live matrix run: A (E1+E3) → 2 findings/needs_changes; B (E4+E5) → 2/needs_changes; C+C2 negative controls → 0/in_review; D chemical-free → 1. All findings cite correct kit rules; 0 uncited. 8–15 ms per check.
  - **Bug caught:** decoder trusted file extensions; a `.png`-named object with JPEG bytes crashed pngjs ("unrecognised content at end of stream"). Fixed with magic-byte sniffing — decode by content, never by name.
  - Note for polish: CIE76 can pick a counter-intuitive "nearest" palette colour for saturated hues (magenta → Linen); flagging threshold works, but CIEDE2000 is the Round-3 upgrade if time allows.
  - Remaining in matrix: E2/E6/E7 are the grounded AI checks (M6). Next: M5 findings UI (accept/reject with ready-to-copy fixes), then M6.

- **23 Oct 2026 — M5 + M7 complete: the decision screen works end to end.**
  - `/items/[id]` is now the money screen: findings (what/where/why/rule/fix), accept/reject with ready-to-copy fixes, override with required reason, approve/return verdict, comments, append-only history, parent/child resubmission links.
  - Server actions with app-layer role gating on top of RLS: creator decisions, reviewer overrides, approver verdicts — all verified via real no-JS server-action POSTs (progressive-enhancement form encoding).
  - Verified: creator accepted a fix (finding fix_accepted, log "by creator User"); reviewer override with reason persisted; approver approved; creator attempting approve → 303 refused, no decision row; resubmission → linked child item re-checked against the same kit version (0 findings → in_review).
  - Verification technique recorded: server actions are curl-able via the rendered `$ACTION_ID_*` / `$ACTION_REF_*` hidden fields (no-JS path) or the `Next-Action` header with the id from the client bundle.
  - Remaining: M6 (grounded AI checks E2/E6/E7 — provider layer + citation enforcement; code+tests buildable with a stub, live run needs a Gemini API key), M8 (reviewer queue + routing polish), M9 (full demo run + backup recording), Vercel live URL.

- **24 Oct 2026 — M8 complete: reviewer queue + routing verified.**
  - `routeFinding` (unit tested): approved_claim → reviewer; confidence < 0.6 → reviewer + needs_human; else creator.
  - `/review` for reviewer/approver/admin: routed findings (with rule citations + item links) and items awaiting verdict; gated notice for creators. Nav updated.
  - Item page: creators only see accept/reject on findings routed to them.
  - Verified live: synthetic AI claim finding citing C-12 appears in reviewer's /review; creator's /review gated; creator sees the claim finding read-only (0 fix buttons, "AI check" badge). Creator-cannot-approve verified in the M5 round.
  - Remaining: M6 (needs Gemini API key for the live run — build with stubbed-model tests first), M9 (full acceptance run + backup recording), Vercel live URL.

- **24 Oct 2026 — M6 complete: grounded AI checks verified live (E2/E6/E7).**
  - Key provided by Shourya, stored only in git-ignored `.env.local` (GEMINI_API_KEY + GEMINI_MODEL).
  - `runAiChecks`: model judges approved_claims/tone/terminology against this kit's rules only; citation enforced in code — uncited findings → `needs_human`, no kit_rule_id, routed to reviewer; schema-invalid output retried once (1.5s backoff), then a single "AI check could not complete" needs_human finding. 7 new unit tests (33 total).
  - Model/transport findings (recorded for the report): `gemini-2.5-flash` retired for new users; the AI SDK's `generateObject` (deprecated) hung on Gemini 3.x thinking models for minutes; production caller is now raw Gemini REST with `responseSchema`, `thinkingBudget: 0`, 45s abort, model via `GEMINI_MODEL` (default `gemini-3.5-flash`, 2–3s per call).
  - Live matrix run: caption with "100% natural" + "AMAZING!!!" + "Glow Naturals" → 3 AI findings (Disallowed Claim Used → C-12 → reviewer; tone; terminology), each confidence 0.95, 3.0s; clean caption → 0 findings; claim finding appears in reviewer /review. A 503 high-demand spike during testing degraded to needs_human exactly as designed.
  - **Full seeded-error matrix now green: E1–E7 all detected with correct citations; negative controls clean.**
  - Remaining: M9 (full acceptance run + backup recording), Vercel live URL, Round-3 items (CIEDE2000, insights view, accessibility checks).
