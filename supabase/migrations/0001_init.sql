-- ============================================================================
-- Vcon — initial schema (Round 2, M0/M1)
-- Run ONCE in the Supabase SQL Editor, or via `supabase db push`.
--
-- SECURITY MODEL (do not weaken):
--   1. Signup ALWAYS creates a profile with role = 'creator' and
--      workspace_id = NULL. The client cannot influence either via
--      user metadata. A user with workspace_id = NULL can see nothing
--      (every policy matches on my_workspace_id(), which is NULL for them).
--   2. Elevated roles (admin / approver / reviewer) and workspace
--      assignment are granted ONLY by trusted operations:
--      - supabase/bootstrap.sql run by a project owner in the SQL editor, or
--      - server-side admin actions (M8) which run as an authenticated admin
--        and are additionally constrained by the RLS policies below.
--   3. RLS is enabled on every table and scoped by workspace_id.
-- ============================================================================

create extension if not exists pgcrypto;

-- ===== Enums ================================================================

create type public.user_role          as enum ('admin', 'creator', 'approver', 'reviewer');
create type public.kit_version_status as enum ('draft', 'published');
create type public.rule_type          as enum (
  'banned_term', 'required_term', 'approved_claim', 'brand_color',
  'tone_guideline', 'disclaimer', 'alt_text_policy', 'custom'
);
create type public.source_kind    as enum ('text', 'image', 'docx');
create type public.context_type   as enum ('instagram_post', 'blog', 'ad', 'email', 'other');
create type public.content_status as enum (
  'uploaded', 'checking', 'needs_changes', 'in_review', 'approved', 'returned', 'failed'
);
create type public.check_status   as enum ('queued', 'running', 'done', 'failed');
create type public.finding_source as enum ('rule_engine', 'ai');
create type public.finding_status as enum ('open', 'fix_accepted', 'fix_rejected', 'overridden', 'needs_human');
create type public.assigned_role  as enum ('creator', 'reviewer');
create type public.decision_action as enum ('approved', 'returned', 'fix_accepted', 'fix_rejected', 'override');

-- ===== Tables ===============================================================

create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  full_name    text not null default '',
  role         public.user_role not null default 'creator',
  created_at   timestamptz not null default now()
);

create table public.brand_kits (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  name               text not null,
  current_version_id uuid, -- FK added after kit_versions exists
  created_at         timestamptz not null default now()
);

create table public.kit_versions (
  id             uuid primary key default gen_random_uuid(),
  kit_id         uuid not null references public.brand_kits (id) on delete cascade,
  version_number integer not null,
  status         public.kit_version_status not null default 'draft',
  published_at   timestamptz,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (kit_id, version_number)
);

alter table public.brand_kits
  add constraint brand_kits_current_version_fkey
  foreign key (current_version_id) references public.kit_versions (id) on delete set null;

create table public.kit_rules (
  id               uuid primary key default gen_random_uuid(),
  kit_version_id   uuid not null references public.kit_versions (id) on delete cascade,
  rule_type        public.rule_type not null,
  name             text not null,
  payload          jsonb not null default '{}'::jsonb,
  severity_default text not null default 'medium' check (severity_default in ('low', 'medium', 'high')),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table public.content_items (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  kit_version_id uuid not null references public.kit_versions (id) on delete restrict,
  created_by     uuid not null references auth.users (id) on delete restrict,
  context_type   public.context_type not null default 'instagram_post',
  source_kind    public.source_kind not null,
  storage_path   text,
  text_content   text,
  alt_text       text,
  status         public.content_status not null default 'uploaded',
  parent_item_id uuid references public.content_items (id) on delete set null,
  created_at     timestamptz not null default now()
);

create table public.checks (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  status          public.check_status not null default 'queued',
  error           text,
  summary         jsonb,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table public.findings (
  id               uuid primary key default gen_random_uuid(),
  check_id         uuid not null references public.checks (id) on delete cascade,
  content_item_id  uuid not null references public.content_items (id) on delete cascade,
  kit_rule_id      uuid references public.kit_rules (id) on delete set null,
  source           public.finding_source not null,
  title            text not null,
  explanation      text not null,
  location         jsonb,
  severity         text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  confidence       numeric(3, 2) check (confidence between 0 and 1),
  suggested_fix    text,
  assigned_to_role public.assigned_role not null default 'creator',
  needs_human      boolean not null default false,
  status           public.finding_status not null default 'open',
  created_at       timestamptz not null default now()
);

create table public.comments (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  finding_id      uuid references public.findings (id) on delete cascade,
  author_id       uuid not null references auth.users (id) on delete restrict,
  body            text not null,
  created_at      timestamptz not null default now()
);

create table public.decision_log (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  finding_id      uuid references public.findings (id) on delete set null,
  actor_id        uuid not null references auth.users (id) on delete restrict,
  action          public.decision_action not null,
  reason          text,
  created_at      timestamptz not null default now()
);

-- ===== Indexes ==============================================================

create index profiles_workspace_idx   on public.profiles (workspace_id);
create index kits_workspace_idx       on public.brand_kits (workspace_id);
create index kit_versions_kit_idx     on public.kit_versions (kit_id);
create index kit_rules_version_idx    on public.kit_rules (kit_version_id);
create index content_items_ws_idx     on public.content_items (workspace_id);
create index content_items_parent_idx on public.content_items (parent_item_id);
create index checks_item_idx          on public.checks (content_item_id);
create index findings_item_idx        on public.findings (content_item_id);
create index findings_check_idx       on public.findings (check_id);
create index comments_item_idx        on public.comments (content_item_id);
create index decision_log_item_idx    on public.decision_log (content_item_id);

-- ===== Helper functions (security definer: avoid RLS recursion) =============

create or replace function public.my_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.my_workspace_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select workspace_id from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean
language sql stable
as $$ select public.my_role() = 'admin' $$;

-- ===== New-user trigger =====================================================
-- SECURITY: role is ALWAYS 'creator'; workspace_id is ALWAYS NULL at signup.
-- raw_user_meta_data.full_name is display-only (not a permission).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, workspace_id, full_name, role)
  values (
    new.id,
    null,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'creator'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Published kit versions are immutable — enforced here at the DB level,
-- not just in the app layer. Rule mutations must target a draft version.
create or replace function public.enforce_rules_in_draft()
returns trigger
language plpgsql
as $$
declare
  v_status public.kit_version_status;
begin
  if tg_op = 'DELETE' then
    select status into v_status from public.kit_versions where id = old.kit_version_id;
  else
    select status into v_status from public.kit_versions where id = new.kit_version_id;
  end if;
  if v_status = 'published' then
    raise exception 'kit version is published and immutable — edits belong in a draft version';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger kit_rules_draft_only
  after insert or update or delete on public.kit_rules
  for each row execute function public.enforce_rules_in_draft();

-- ===== Row Level Security ===================================================

alter table public.workspaces    enable row level security;
alter table public.profiles      enable row level security;
alter table public.brand_kits    enable row level security;
alter table public.kit_versions  enable row level security;
alter table public.kit_rules     enable row level security;
alter table public.content_items enable row level security;
alter table public.checks        enable row level security;
alter table public.findings      enable row level security;
alter table public.comments      enable row level security;
alter table public.decision_log  enable row level security;

-- workspaces: members read their own; only admins create
create policy "members read own workspace" on public.workspaces
  for select using (id = public.my_workspace_id());

create policy "admins create workspaces" on public.workspaces
  for insert with check (public.is_admin() and created_by = auth.uid());

-- profiles: read own + same-workspace; self-update cannot change role/workspace;
-- admins update profiles in their workspace or unassigned profiles (invites)
create policy "read own and workspace profiles" on public.profiles
  for select using (id = auth.uid() or workspace_id = public.my_workspace_id());

create policy "self-update without elevation" on public.profiles
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and workspace_id = public.my_workspace_id()
    and role = public.my_role()
  );

create policy "admins manage workspace profiles" on public.profiles
  for update
  using (public.is_admin() and (workspace_id = public.my_workspace_id() or workspace_id is null))
  with check (public.is_admin() and workspace_id = public.my_workspace_id());

-- brand_kits
create policy "members read kits" on public.brand_kits
  for select using (workspace_id = public.my_workspace_id());

create policy "admins manage kits" on public.brand_kits
  for all
  using (public.is_admin() and workspace_id = public.my_workspace_id())
  with check (public.is_admin() and workspace_id = public.my_workspace_id());

-- kit_versions
create policy "members read kit versions" on public.kit_versions
  for select using (
    exists (
      select 1 from public.brand_kits k
      where k.id = kit_id and k.workspace_id = public.my_workspace_id()
    )
  );

create policy "admins manage kit versions" on public.kit_versions
  for all
  using (
    exists (
      select 1 from public.brand_kits k
      where k.id = kit_id and k.workspace_id = public.my_workspace_id()
    )
    and public.is_admin()
  )
  with check (
    exists (
      select 1 from public.brand_kits k
      where k.id = kit_id and k.workspace_id = public.my_workspace_id()
    )
    and public.is_admin()
  );

-- kit_rules
create policy "members read kit rules" on public.kit_rules
  for select using (
    exists (
      select 1
      from public.kit_versions v
      join public.brand_kits k on k.id = v.kit_id
      where v.id = kit_version_id and k.workspace_id = public.my_workspace_id()
    )
  );

create policy "admins manage kit rules" on public.kit_rules
  for all
  using (
    exists (
      select 1
      from public.kit_versions v
      join public.brand_kits k on k.id = v.kit_id
      where v.id = kit_version_id and k.workspace_id = public.my_workspace_id()
    )
    and public.is_admin()
  )
  with check (
    exists (
      select 1
      from public.kit_versions v
      join public.brand_kits k on k.id = v.kit_id
      where v.id = kit_version_id and k.workspace_id = public.my_workspace_id()
    )
    and public.is_admin()
  );

-- content_items: members read; creators insert their own; members update
-- (status transitions are additionally role-checked in the app layer)
create policy "members read items" on public.content_items
  for select using (workspace_id = public.my_workspace_id());

create policy "members insert own items" on public.content_items
  for insert with check (
    workspace_id = public.my_workspace_id() and created_by = auth.uid()
  );

create policy "members update items" on public.content_items
  for update
  using (workspace_id = public.my_workspace_id())
  with check (workspace_id = public.my_workspace_id());

-- checks: written by the check runner, which runs as the requesting user
create policy "members read checks" on public.checks
  for select using (
    exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  );

create policy "members write checks" on public.checks
  for insert with check (
    exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  );

create policy "members update checks" on public.checks
  for update
  using (
    exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  )
  with check (
    exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  );

-- findings
create policy "members read findings" on public.findings
  for select using (
    exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  );

create policy "members write findings" on public.findings
  for insert with check (
    exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  );

create policy "members update findings" on public.findings
  for update
  using (
    exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  )
  with check (
    exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  );

-- comments: read by workspace; authors insert their own
create policy "members read comments" on public.comments
  for select using (
    exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  );

create policy "members insert own comments" on public.comments
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  );

-- decision_log: append-only for workspace members.
-- NOTE: which role may perform which action (approve/return/override vs
-- accept/reject fix) is enforced in the server layer (M7/M8) — RLS here
-- guarantees workspace isolation and append-only history.
create policy "members read decision log" on public.decision_log
  for select using (
    exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  );

create policy "members append decisions" on public.decision_log
  for insert with check (
    actor_id = auth.uid()
    and exists (
      select 1 from public.content_items c
      where c.id = content_item_id and c.workspace_id = public.my_workspace_id()
    )
  );

-- ===== Storage ==============================================================
-- Path convention: content/<workspace_id>/<content_item_id>/<filename>
-- The first path segment must equal the caller's workspace id.

insert into storage.buckets (id, name, public)
values ('content', 'content', false)
on conflict (id) do nothing;

create policy "members read workspace files" on storage.objects
  for select using (
    bucket_id = 'content'
    and (storage.foldername(name))[1] = public.my_workspace_id()::text
  );

create policy "members upload workspace files" on storage.objects
  for insert with check (
    bucket_id = 'content'
    and (storage.foldername(name))[1] = public.my_workspace_id()::text
  );

create policy "members update workspace files" on storage.objects
  for update using (
    bucket_id = 'content'
    and (storage.foldername(name))[1] = public.my_workspace_id()::text
  );
