-- ============================================================================
-- Vcon — trusted bootstrap (run ONCE, in the Supabase SQL Editor, as the
-- project owner). This is the ONLY sanctioned way to grant elevated roles or
-- assign workspaces outside the app. Do NOT move this logic into client code.
--
-- Steps:
--   1. Sign up in the app with the email that should become the admin.
--   2. Replace ADMIN_EMAIL_HERE below, then run this file.
--   3. Sign in again in the app — the shell will show role "Admin".
--
-- Works in both setups:
--   - local stack: `supabase db reset` has already run seed.sql, so the
--     GlowNaturals Demo workspace exists — the admin is attached to it.
--   - cloud project: if no workspace exists yet, one is created here.
--
-- To add more members afterwards, use step 2 at the bottom (attach + grant).
-- ============================================================================

-- 1) Promote the signed-up user to workspace admin and attach them to the
--    first workspace (creating one if none exists).
with admin_user as (
  select id from auth.users where email = 'ADMIN_EMAIL_HERE' limit 1
),
ws as (
  select id from public.workspaces order by created_at limit 1
),
ensure_ws as (
  insert into public.workspaces (name)
  select 'Demo Workspace'
  where not exists (select 1 from public.workspaces)
  returning id
),
target_ws as (
  select id from ws
  union
  select id from ensure_ws
  limit 1
)
update public.profiles p
set role = 'admin',
    workspace_id = tw.id
from admin_user a, target_ws tw
where p.id = a.id;

-- 2) Attach another signed-up user to the workspace and optionally grant a
--    role ('creator' is the default; use 'approver' or 'reviewer' if needed):
--
--    update public.profiles
--    set workspace_id = (select id from public.workspaces order by created_at limit 1)
--    where id = (select id from auth.users where email = 'MEMBER_EMAIL_HERE');
--
--    update public.profiles
--    set role = 'approver'
--    where id = (select id from auth.users where email = 'MEMBER_EMAIL_HERE');
