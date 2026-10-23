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
-- To add more members afterwards, use step 2 at the bottom (attach + grant).
-- ============================================================================

-- 1) Create the workspace and promote the user to admin in one transaction.
with admin_user as (
  select id from auth.users where email = 'ADMIN_EMAIL_HERE' limit 1
),
ws as (
  insert into public.workspaces (name, created_by)
  select 'Demo Workspace', id from admin_user
  returning id
)
update public.profiles p
set role = 'admin',
    workspace_id = ws.id
from admin_user a, ws
where p.id = a.id;

-- 2) Attach another signed-up user to the workspace and optionally grant a
--    role ('creator' is the default; use 'approver' or 'reviewer' if needed):
--
--    update public.profiles
--    set workspace_id = '<WORKSPACE_UUID>'
--    where id = (select id from auth.users where email = 'MEMBER_EMAIL_HERE');
--
--    update public.profiles
--    set role = 'approver'
--    where id = (select id from auth.users where email = 'MEMBER_EMAIL_HERE');
