# Vcon

Pre-publication brand governance platform — FutureStack Hackathon, Round 2 build
(Team CON-V). Content is checked against a company's approved brand kit before
it goes public. Every flag is explained, cites its rule, and is decided by a
human. See [PLAN.md](./PLAN.md) for the full build plan.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4) on Vercel
- **Supabase** — Postgres (RLS everywhere), Auth, Storage
- **Gemini** via the Vercel AI SDK from M6 (deterministic checks run first)
- pnpm

## Quickstart

### Option A — local Supabase stack (recommended for development)

Prereqs: pnpm, Docker (any local daemon — Colima works; pass `DOCKER_HOST` if
your socket is not the default).

```bash
pnpm install
supabase start          # prints URL + keys; add DOCKER_HOST=... if needed
supabase db reset       # applies migrations, then runs supabase/seed.sql
```

`db reset` creates the **GlowNaturals** workspace + brand kit v1 (8 rules).
Then:

```bash
cp .env.example .env.local   # fill from `supabase status` (URL + publishable key;
                             # sb_secret_ is the service-role equivalent)
pnpm build && pnpm start     # http://localhost:3000  (or: pnpm dev)
```

Sign up in the app with your admin email, then run
[`supabase/bootstrap.sql`](./supabase/bootstrap.sql) (edit `ADMIN_EMAIL_HERE`)
in Studio's SQL editor (http://127.0.0.1:54323) or via
`docker exec supabase_db_$(basename $PWD) psql -U postgres -d postgres`. That
promotes the admin and attaches users — the only sanctioned elevation path.

Users verified during setup: `admin@vcon.test`, `creator@vcon.test`,
`outsider@vcon.test` — password `password123` (local test data only).

### Option B — cloud Supabase project

1. Create a project at [supabase.com](https://supabase.com) → SQL Editor → run
   [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql)
   → run [`supabase/seed.sql`](./supabase/seed.sql).
2. `cp .env.example .env.local` → paste your project URL + API keys
   (Settings → API; new projects use `sb_publishable_` / `sb_secret_` keys —
   the variable names below stay the same).
3. `pnpm dev`, sign up, run `supabase/bootstrap.sql` for the first admin.

### Demo tip

Disable email confirmation for quick demos: Supabase → **Authentication →
Providers → Email → turn off "Confirm email"** (or confirm via the inbox link).

## Security model (do not weaken)

- `handle_new_user()` always sets `role = 'creator'`, `workspace_id = NULL`.
  User metadata cannot grant roles.
- RLS on every table, scoped by `workspace_id`. Unassigned users see nothing.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — server-side only, never
  `NEXT_PUBLIC_`, never committed.
- Storage paths are `content/<workspace_id>/<item_id>/<file>`; policies pin
  the first path segment to the caller's workspace.

## Deploy (Vercel)

1. Push to GitHub.
2. Vercel → **Add New Project** → import the repo (framework auto-detected).
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
   **Settings → Environment Variables** (add the AI keys when M6 lands).
4. Deploy — every push to `main` ships; PRs get preview links.

## Project structure

```
supabase/
  migrations/0001_init.sql   # schema, RLS, triggers, storage (run once)
  bootstrap.sql              # trusted first-admin + workspace setup
src/
  proxy.ts                   # Next 16 proxy (ex-middleware): session + route guard
  app/
    login/                   # sign in / sign up (no role picker — by design)
    auth/                    # callback (email links) + signout route handlers
    (app)/                   # authenticated shell (header with role badge)
  lib/
    supabase/                # browser / server / proxy clients
    env.ts, types.ts         # env guard, roles
```

## Status

Milestone tracker lives in [PLAN.md](./PLAN.md) §8. Current: **M0** (scaffold,
deploy, auth with roles).
