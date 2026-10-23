-- ============================================================================
-- Vcon — seed: "GlowNaturals" synthetic brand kit, version 1 (M1)
--
-- TRUSTED OPERATION: run by the project owner (Supabase SQL Editor, or
-- automatically by `supabase db reset` on the local stack).
--
-- Idempotent:
--   - creates the demo workspace only if no workspace exists yet,
--   - attaches the brand kit only if the workspace has none.
--
-- No user dependency: workspaces are independent of auth.users. Admin
-- promotion + user attachment happen in supabase/bootstrap.sql AFTER the
-- first admin signs up.
--
-- The rule payloads below are the CONTRACT that M4's deterministic checkers
-- and M6's AI checks parse. The seeded-error matrix built on these rules
-- lives in docs/acceptance.md.
-- ============================================================================

do $$
declare
  ws  uuid;
  kit uuid;
  ver uuid;
begin
  -- 1) Workspace (independent of users; created_by left NULL for seeded ws)
  if not exists (select 1 from public.workspaces) then
    insert into public.workspaces (name)
    values ('GlowNaturals Demo')
    returning id into ws;
    raise notice 'Created workspace %.', ws;
  else
    select id into ws from public.workspaces order by created_at limit 1;
  end if;

  -- 2) Brand kit
  if exists (select 1 from public.brand_kits where workspace_id = ws) then
    raise notice 'Workspace % already has a brand kit — seed skipped.', ws;
    return;
  end if;

  insert into public.brand_kits (workspace_id, name)
  values (ws, 'GlowNaturals Brand Kit')
  returning id into kit;

  -- Insert as draft (published versions are immutable by DB trigger),
  -- add the rules, then publish.
  insert into public.kit_versions (kit_id, version_number, status)
  values (kit, 1, 'draft')
  returning id into ver;

  update public.brand_kits
  set current_version_id = ver
  where id = kit;

  insert into public.kit_rules (kit_version_id, rule_type, name, payload, severity_default)
  values
    -- Deterministic checker contracts -------------------------------------------------
    (ver, 'brand_color', 'Approved palette',
     '{"colors":[{"name":"Sage","hex":"#7C9A6D"},{"name":"Honey","hex":"#E8B04B"},{"name":"Linen","hex":"#F5F1E8"}],"max_delta_e":10}'::jsonb,
     'low'),

    (ver, 'banned_term', 'Banned: "miracle"',
     '{"terms":["miracle","miraculous"]}'::jsonb,
     'high'),

    (ver, 'banned_term', 'Banned: "chemical-free"',
     '{"terms":["chemical-free","chemical free"]}'::jsonb,
     'high'),

    (ver, 'disclaimer', 'Disclaimer with performance claims',
     '{"trigger_terms":["clinically proven"],"required_text":"Results may vary"}'::jsonb,
     'medium'),

    (ver, 'alt_text_policy', 'Alt text required',
     '{"require_alt_text":true,"min_length":20}'::jsonb,
     'medium'),

    -- AI checker contracts -------------------------------------------------------------
    (ver, 'approved_claim', 'Approved claims (C-12)',
     '{"allowed":["made with natural ingredients","dermatologist tested"],"explicitly_disallowed":["100% natural","100% organic","cures acne"]}'::jsonb,
     'high'),

    (ver, 'tone_guideline', 'Voice: warm, plain-spoken',
     '{"voice":"Warm, plain-spoken, no hype.","avoid":["excessive exclamation marks","ALL-CAPS words","fear-based urgency"]}'::jsonb,
     'medium'),

    (ver, 'custom', 'Terminology: brand name',
     '{"preferred":"GlowNaturals","avoid":["Glow Naturals"]}'::jsonb,
     'low');

  update public.kit_versions
  set status = 'published', published_at = now()
  where id = ver;

  raise notice 'Seeded GlowNaturals kit v1 (%) with 8 rules into workspace %.', ver, ws;
end;
$$;
