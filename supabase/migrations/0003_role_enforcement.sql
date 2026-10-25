-- ============================================================================
-- Vcon — migration 0003: DB-level role + transition enforcement
--
-- Closes the "DB role bypass" gap: until now, role gates (creator accepts a
-- fix, reviewer overrides, approver gives the verdict) lived only in the
-- server actions, so any workspace member could perform privileged writes by
-- calling PostgREST directly. These triggers mirror the app's gates at the
-- database level, without changing any legitimate flow:
--
--   content_items : storage_path attachable only by the item's creator, only
--                   while the item is 'uploaded', and only inside the item's
--                   own folder (content/<workspace_id>/<item_id>/<file> — the
--                   same convention the storage RLS pins). After creation only
--                   `status` may change. Pipeline states (needs_changes /
--                   in_review / failed) are only settable from 'checking'.
--                   Verdicts (approved / returned) only by approvers or
--                   admins, never while a check is running. Approved items
--                   are frozen — decisions live in the append-only log.
--   findings      : immutable except `status`. fix_accepted / fix_rejected
--                   only on creator-routed findings, by creators or admins;
--                   overridden only by reviewers, approvers or admins.
--   decision_log  : the logged action must match the actor's role (same
--                   mapping as the server actions). Append-only already
--                   enforced by the absence of UPDATE/DELETE policies.
--
-- The pipeline writes findings/checks and moves items through 'checking' as
-- the requesting user, which these rules permit. Trusted maintenance contexts
-- (SQL editor, service_role — no JWT, so my_role() is null) keep working:
-- RLS still constrains them, and no client-facing path can reach them.
--
-- Idempotent. Run in the SQL editor or via `supabase db push`.
-- ============================================================================

-- ===== content_items ========================================================

create or replace function public.enforce_item_writes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
begin
  -- Trusted maintenance context (no JWT): nothing to enforce for a caller
  -- that never went through PostgREST auth.
  if v_role is null then
    return new;
  end if;

  -- storage_path: attach/replace only by the item's creator, only while the
  -- item is still 'uploaded' with status untouched, and only inside the item's
  -- own folder — never a pointer at another item's object.
  if new.storage_path is distinct from old.storage_path then
    if old.status <> 'uploaded'
       or new.status is distinct from old.status
       or auth.uid() is distinct from old.created_by
       or new.storage_path is null
       or new.storage_path = ''
       or split_part(new.storage_path, '/', 1) <> old.workspace_id::text
       or split_part(new.storage_path, '/', 2) <> old.id::text then
      raise exception 'storage_path may only be set by the item creator, while the item is uploaded, inside content/<workspace_id>/<item_id>/';
    end if;
  end if;

  -- No other column may change after creation.
  if new.workspace_id   is distinct from old.workspace_id
  or new.kit_version_id is distinct from old.kit_version_id
  or new.created_by     is distinct from old.created_by
  or new.context_type   is distinct from old.context_type
  or new.source_kind    is distinct from old.source_kind
  or new.text_content   is distinct from old.text_content
  or new.alt_text       is distinct from old.alt_text
  or new.parent_item_id is distinct from old.parent_item_id
  then
    raise exception 'content items are append-only: only status (and storage_path during upload) may change';
  end if;

  -- Same-status writes (e.g. re-running a guard) pass through.
  if new.status = old.status then
    return new;
  end if;

  -- Decisions are history; an approved item never changes again.
  if old.status = 'approved' then
    raise exception 'approved items are immutable';
  end if;

  -- Verdicts: approvers/admins only, never while a check is running.
  if new.status in ('approved', 'returned') then
    if old.status = 'checking' then
      raise exception 'cannot give a verdict while a check is running';
    end if;
    if v_role not in ('approver', 'admin') then
      raise exception 'only approvers or admins can approve or return content';
    end if;
    return new;
  end if;

  -- Pipeline-driven states: the runner always writes these from 'checking'.
  if new.status in ('needs_changes', 'in_review', 'failed') then
    if old.status <> 'checking' then
      raise exception 'status % is set by the check pipeline only (from checking)', new.status;
    end if;
    return new;
  end if;

  -- (Re)starting a check: any workspace member, from a pre-review state.
  if new.status = 'checking' then
    if old.status not in ('uploaded', 'failed', 'needs_changes') then
      raise exception 'a check cannot start from status %', old.status;
    end if;
    return new;
  end if;

  raise exception 'status transition % -> % is not allowed', old.status, new.status;
end;
$$;

drop trigger if exists content_items_write_guard on public.content_items;
create trigger content_items_write_guard
  before update on public.content_items
  for each row execute function public.enforce_item_writes();

-- ===== findings =============================================================

create or replace function public.enforce_finding_writes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
begin
  if v_role is null then
    return new;
  end if;

  -- Findings are evidence: immutable except for the decision status.
  if new.check_id         is distinct from old.check_id
  or new.content_item_id  is distinct from old.content_item_id
  or new.kit_rule_id      is distinct from old.kit_rule_id
  or new.source           is distinct from old.source
  or new.title            is distinct from old.title
  or new.explanation      is distinct from old.explanation
  or new.location         is distinct from old.location
  or new.severity         is distinct from old.severity
  or new.confidence       is distinct from old.confidence
  or new.suggested_fix    is distinct from old.suggested_fix
  or new.assigned_to_role is distinct from old.assigned_to_role
  or new.needs_human      is distinct from old.needs_human
  then
    raise exception 'findings are immutable except for status';
  end if;

  if new.status = old.status then
    return new;
  end if;

  -- Override is a reviewer/approver/admin decision.
  if new.status = 'overridden' then
    if v_role not in ('reviewer', 'approver', 'admin') then
      raise exception 'only reviewers, approvers or admins can override a finding';
    end if;
    return new;
  end if;

  -- Fix decisions belong to the creator loop, on creator-routed findings —
  -- a creator can never dispose of a finding routed to reviewers.
  if new.status in ('fix_accepted', 'fix_rejected') then
    if old.assigned_to_role <> 'creator' then
      raise exception 'fix decisions apply only to creator-routed findings';
    end if;
    if v_role not in ('creator', 'admin') then
      raise exception 'only creators or admins accept or reject fixes';
    end if;
    return new;
  end if;

  raise exception 'finding status transition % -> % is not allowed', old.status, new.status;
end;
$$;

drop trigger if exists findings_write_guard on public.findings;
create trigger findings_write_guard
  before update on public.findings
  for each row execute function public.enforce_finding_writes();

-- ===== decision_log =========================================================

create or replace function public.enforce_decision_role()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
begin
  if v_role is null then
    return new;
  end if;

  -- The logged action must match the actor's role (mirrors the server
  -- actions: isApprover / isReviewer / isCreator).
  if new.action in ('approved', 'returned')
     and v_role not in ('approver', 'admin') then
    raise exception 'only approvers or admins can log a verdict';
  end if;

  if new.action = 'override'
     and v_role not in ('reviewer', 'approver', 'admin') then
    raise exception 'only reviewers, approvers or admins can log an override';
  end if;

  if new.action in ('fix_accepted', 'fix_rejected')
     and v_role not in ('creator', 'admin') then
    raise exception 'only creators or admins can log a fix decision';
  end if;

  return new;
end;
$$;

drop trigger if exists decision_log_role_guard on public.decision_log;
create trigger decision_log_role_guard
  before insert on public.decision_log
  for each row execute function public.enforce_decision_role();
