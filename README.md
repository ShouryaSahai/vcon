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

1. **Install**

   ```bash
   pnpm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com), then
   run the schema: open the project → **SQL Editor** → paste
   [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql)
   → run (once).

3. **Configure environment**

   ```bash
   cp .env.example .env.local
   # fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
   # (Project Settings → API). Leave service-role key unset for now (M8).
   ```

4. **Run**

   ```bash
   pnpm dev        # http://localhost:3000
   ```

5. **Create the first admin (trusted operation)**

   Sign up in the app with the email that should be admin, then run
   [`supabase/bootstrap.sql`](./supabase/bootstrap.sql) in the SQL Editor
   (edit `ADMIN_EMAIL_HERE` first). Signup always creates a `creator` with no
   workspace; roles and workspace access are granted **only** here or by
   in-app admin actions (M8). Never from client input.

6. **Invite the rest of the team** — each member signs up (they start as
   `creator`, workspace unassigned), then the admin attaches them per the
   comments at the bottom of `supabase/bootstrap.sql`.

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
