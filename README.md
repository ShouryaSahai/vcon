# Vcon

Pre-publication brand governance platform — FutureStack Hackathon, Round 2 build
(Team CON-V). Content is checked against a company's approved brand kit before
it goes public. Every flag is explained, cites its rule, and is decided by a
human. See [PLAN.md](./PLAN.md) for the full build plan.

**Live:** https://vcon-six.vercel.app · Seeded demo data only (GlowNaturals
brand kit; no real brand material — see [docs/acceptance.md](./docs/acceptance.md)
for the full acceptance run).

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4) on Vercel
- **Supabase** — Postgres (RLS everywhere), Auth, Storage
- **Gemini** — deterministic checks run first; tone/claim/terminology rules are
  judged by the model via structured REST calls (thinking disabled, 45 s
  timeout), with citations enforced in code — an uncited AI finding is routed
  to human review, never counted
- pnpm

## Why navigation feels instant

The app is built on **Cache Components with Partial Prerendering** (Next 16):
every route ships a prerendered **static shell** (sidebar, nav, page frame) that
paints the moment you click, while only the small session-derived slots
(review badge, workspace chip, user row) and page content stream in. Session
reads use `"use cache: private"` — cached per browser, prefetch-eligible, never
stored server-side. No route blocks on a server round trip; even a cold serverless
function can't delay the first paint. A ↻ button in the sidebar soft-refreshes
the current screen's server data (keeps scroll + filters) whenever you want
fresh numbers without a full reload.

Timestamps render through one pinned formatter (`en-IN` + `Asia/Kolkata`,
`src/lib/format.ts`) so server and client always agree — times are IST
everywhere, regardless of which region serves the request.

## Upload safety

Image uploads are restricted in depth against oversized and "decompression
bomb" files (a tiny PNG claiming huge dimensions can make decoders allocate
gigabytes):

1. **Browser** — size/type checked before anything is created (10 MB, PNG/JPEG only)
2. **Storage** — the private `content` bucket caps files at 10 MB
   ([migration 0002](./supabase/migrations/0002_image_limits.sql))
3. **Pre-decode probe** — dimensions are read from PNG/JPEG *headers only*
   (caps: 10 MB / 30 MP / 12,000 px per side; shared by client and server in
   `src/lib/checks/image-limits.ts`)
4. **Honest failure** — a rejected image produces a specific `needs_human`
   finding and an "incomplete" banner, never a crash or a silent pass

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

Current setup: production deployments are created from the repository files
via the Vercel API. To switch to auto-deploy on push, install the Vercel
GitHub App (Vercel dashboard → Git Integrations) and link the `vcon` project
to `ShouryaSahai/vcon` — after that, every push to `main` ships and PRs get
preview links.

Environment variables the deployment needs: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus `GEMINI_API_KEY` and `GEMINI_MODEL`
(the AI checker degrades to explicit `needs human` findings when the key is
absent — it never reports a silent pass).

## Project structure

```
supabase/
  migrations/0001_init.sql   # schema, RLS, triggers, storage (run once)
  migrations/0002_image_limits.sql  # 10 MB cap on the content bucket
  bootstrap.sql              # trusted first-admin + workspace setup
src/
  proxy.ts                   # Next 16 proxy (ex-middleware): session + route guard
  app/
    login/                   # sign in / sign up (no role picker — by design)
    auth/                    # callback (email links) + signout route handlers
    (app)/                   # authenticated shell — static PPR shell + streaming slots
  components/
    app-nav.tsx              # shell nav (prerender-safe, active state behind a boundary)
    refresh-button.tsx       # soft refresh of server data
    ui/                      # shadcn-style primitives (card, button, input, …)
  lib/
    supabase/                # browser / server / proxy clients
    auth.ts                  # use cache:private session reads (shell holes)
    cached.ts                # tagged server-side read models (kit context)
    format.ts                # pinned IST timestamp formatting
    checks/                  # deterministic + AI checkers, image limits
    env.ts, types.ts         # env guard, roles
```

## Status

Milestone tracker lives in [PLAN.md](./PLAN.md) §8. Current: **deployed through
M9 + the instant-navigation pass** — live at https://vcon-six.vercel.app
(PPR shells on every route, image restrictor, IST timestamps; acceptance run in
[docs/acceptance.md](./docs/acceptance.md) §5, build evidence in PLAN.md
§14–15).
