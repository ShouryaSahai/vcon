# Vcon — Project Notes

Vcon is a pre-publication brand-governance workflow for teams that create marketing content with employees, agencies, or AI tools. It checks drafts against a versioned brand kit and routes findings to people for review before publication.

## Product scope

- Brand kits with versioned rules for approved claims, terminology, tone, disclaimers, banned/required terms, colours, and image alt text.
- Text and image submissions, with a recorded kit version for each check.
- Deterministic checks first; AI-assisted tone, claims, and terminology checks grounded in kit rules.
- Findings show the issue, location, cited rule, confidence where available, and a suggested correction.
- Role-aware creator/reviewer/approver workflow, comments, decision history, and linked resubmissions.
- Upload safeguards for PNG/JPEG size and dimensions, plus rate limiting on check requests.
- Synthetic GlowNaturals sample data only.

## Architecture

- **Web:** Next.js App Router, TypeScript, Tailwind CSS.
- **Data and identity:** Supabase Postgres, Auth, and private Storage.
- **AI:** server-side Gemini requests; citation validation is enforced in application code.
- **Hosting:** Vercel. GitHub pushes do not currently guarantee a production deployment, so verify the deployed revision separately.

## Database migrations

Apply migrations in numeric order before seeding a new database:

1. [0001_init.sql](./supabase/migrations/0001_init.sql) — schema, RLS policies, auth bootstrap, and private storage bucket.
2. [0002_image_limits.sql](./supabase/migrations/0002_image_limits.sql) — storage-level 10 MB upload cap.
3. [0003_role_enforcement.sql](./supabase/migrations/0003_role_enforcement.sql) — database triggers for item-state and finding/decision role checks.
4. [seed.sql](./supabase/seed.sql) — synthetic sample workspace and brand kit.

**Hosted database caveat:** as of the last recorded check on 25 October 2026, migration 0003 was committed to the repository but had not yet been applied to the hosted Supabase project. Until it is applied and verified there, do not assume its database-level guards are active in production. The migration files are source code; committing them does not apply them to a hosted database.

## Verification evidence

The repository's last recorded local checks (25 October 2026) reported:

- ESLint: 0 problems.
- Unit tests: 41 passed.
- Production build: successful.
- Migration 0003 REST verification: 30/30 cases passed against the local Supabase stack.
- Acceptance rehearsal: 7/7 seeded errors detected, zero false positives, and cited rules recorded.

These are recorded results from the development environment, not a claim that the currently hosted deployment or hosted database has passed the same checks. See [docs/acceptance.md](./docs/acceptance.md) for the synthetic acceptance matrix.

## Release checks still required

- Apply migration 0003 to the hosted database and verify it with the provided script.
- Deploy the intended Git commit; test sign-in and authenticated `/items`, `/review`, and `/upload` routes, then inspect fresh runtime logs. A Next.js `Date.now()` prerender error was previously observed in the hosted auth/session path.
- Configure only demo-specific credentials for any public judge account. Never use a personal account or commit credentials.
- Re-run lint, unit tests, production build, and `git diff --check` before release.

## Data and security boundaries

- Use synthetic/example brand material for demos.
- Keep AI and Supabase secret keys server-side in environment variables. Never use a `NEXT_PUBLIC_` prefix for a service-role secret.
- `.env*` files are ignored by Git; only the blank `.env.example` template is intentionally tracked.
- RLS scopes normal data access to the caller's workspace; confirm the hosted migrations and policies before using real data.

