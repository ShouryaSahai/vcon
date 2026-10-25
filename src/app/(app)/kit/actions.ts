"use server";

import { revalidatePath, updateTag } from "next/cache";

import type { Json, KitRule, RuleType, Severity } from "@/lib/db-types";
import { RULE_TYPES, SEVERITIES } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; message?: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Gate for every kit mutation: signed-in + workspace assigned + admin role.
 * RLS is the enforcement point; this is the app-layer second check
 * (defence in depth — see the security model in the README).
 */
async function requireAdmin(): Promise<
  { error: string } | { supabase: SupabaseServerClient; workspaceId: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return { error: "No workspace assigned yet." };
  if (profile.role !== "admin") {
    return { error: "Only admins can manage the brand kit." };
  }
  return { supabase, workspaceId: profile.workspace_id };
}

function isRuleType(value: string): value is RuleType {
  return (RULE_TYPES as readonly string[]).includes(value);
}

function isSeverity(value: string): value is Severity {
  return (SEVERITIES as readonly string[]).includes(value);
}

/** Creates the workspace's first brand kit with an empty v1 draft. */
export async function createKit(): Promise<void> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return;

  const { data: existing } = await ctx.supabase
    .from("brand_kits")
    .select("id")
    .maybeSingle();
  if (existing) {
    revalidatePath("/kit");
    return;
  }

  const { data: kit } = await ctx.supabase
    .from("brand_kits")
    .insert({ workspace_id: ctx.workspaceId, name: "Brand Kit" })
    .select("id")
    .single();
  if (!kit) return;

  await ctx.supabase
    .from("kit_versions")
    .insert({ kit_id: kit.id, version_number: 1, status: "draft" });

  updateTag(`ws-${ctx.workspaceId}`);
  revalidatePath("/kit");
}

/** Creates a new draft version cloned from the current published rules (idempotent). */
export async function ensureDraft(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };

  const kitId = String(formData.get("kit_id") ?? "");
  if (!kitId) return { error: "Missing brand kit." };

  const { data: versions } = await ctx.supabase
    .from("kit_versions")
    .select("id, version_number, status")
    .eq("kit_id", kitId)
    .order("version_number");
  if (!versions) return { error: "Could not load kit versions." };

  if (versions.some((v) => v.status === "draft")) {
    revalidatePath("/kit");
    return { message: "Draft already exists." };
  }

  const nextNumber =
    versions.reduce((max, v) => Math.max(max, v.version_number), 0) + 1;

  const { data: created, error } = await ctx.supabase
    .from("kit_versions")
    .insert({ kit_id: kitId, version_number: nextNumber, status: "draft" })
    .select("id")
    .single();
  if (error || !created) {
    return { error: error?.message ?? "Could not create draft version." };
  }

  // Clone the current published rules into the draft (skip payload typing via Row).
  const { data: kit } = await ctx.supabase
    .from("brand_kits")
    .select("current_version_id")
    .eq("id", kitId)
    .single();
  if (kit?.current_version_id) {
    const { data: rules } = await ctx.supabase
      .from("kit_rules")
      .select("rule_type, name, payload, severity_default, is_active")
      .eq("kit_version_id", kit.current_version_id);
    const clones: KitRule[] = (rules ?? []) as unknown as KitRule[];
    if (clones.length > 0) {
      await ctx.supabase.from("kit_rules").insert(
        clones.map((r) => ({
          kit_version_id: created.id,
          rule_type: r.rule_type,
          name: r.name,
          payload: r.payload,
          severity_default: r.severity_default,
          is_active: r.is_active,
        })),
      );
    }
  }

  revalidatePath("/kit");
  return { message: `Draft v${nextNumber} created.` };
}

function parsePayload(raw: string): Json | string {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return "Rule payload is not valid JSON.";
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return "Rule payload must be a JSON object.";
  }
  return payload as Json;
}

/** Verifies the given version exists and is still a draft (published = immutable). */
async function assertDraftVersion(
  supabase: SupabaseServerClient,
  versionId: string,
): Promise<string | null> {
  const { data: version } = await supabase
    .from("kit_versions")
    .select("status")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) return "Rule version not found.";
  if (version.status !== "draft") {
    return "Published versions are immutable — create a new draft to make changes.";
  }
  return null;
}

export async function addRule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };

  const versionId = String(formData.get("version_id") ?? "");
  const ruleType = String(formData.get("rule_type") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const severity = String(formData.get("severity") ?? "");

  if (!versionId) return { error: "No draft version — create a draft first." };
  if (!isRuleType(ruleType)) return { error: "Invalid rule type." };
  if (!isSeverity(severity)) return { error: "Invalid severity." };
  if (!name) return { error: "Rule name is required." };

  const payload = parsePayload(String(formData.get("payload") ?? "{}"));
  if (typeof payload === "string") return { error: payload };

  const versionError = await assertDraftVersion(ctx.supabase, versionId);
  if (versionError) return { error: versionError };

  const { error } = await ctx.supabase.from("kit_rules").insert({
    kit_version_id: versionId,
    rule_type: ruleType,
    name,
    payload,
    severity_default: severity,
  });
  if (error) return { error: error.message };

  revalidatePath("/kit");
  return { message: "Rule added." };
}

export async function updateRule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };

  const id = String(formData.get("id") ?? "");
  const ruleType = String(formData.get("rule_type") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const severity = String(formData.get("severity") ?? "");
  if (!id) return { error: "Missing rule." };
  if (!isRuleType(ruleType)) return { error: "Invalid rule type." };
  if (!isSeverity(severity)) return { error: "Invalid severity." };
  if (!name) return { error: "Rule name is required." };

  const payload = parsePayload(String(formData.get("payload") ?? "{}"));
  if (typeof payload === "string") return { error: payload };

  const { data: existing } = await ctx.supabase
    .from("kit_rules")
    .select("kit_version_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "Rule not found." };

  const versionError = await assertDraftVersion(ctx.supabase, existing.kit_version_id);
  if (versionError) return { error: versionError };

  const { error } = await ctx.supabase
    .from("kit_rules")
    .update({ rule_type: ruleType, name, payload, severity_default: severity })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/kit");
  return { message: "Rule updated." };
}

export async function setRuleActive(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return;

  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("is_active") ?? "") === "true";
  if (!id) return;

  const { data: existing } = await ctx.supabase
    .from("kit_rules")
    .select("kit_version_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return;

  const versionError = await assertDraftVersion(ctx.supabase, existing.kit_version_id);
  if (versionError) return;

  await ctx.supabase.from("kit_rules").update({ is_active: next }).eq("id", id);
  revalidatePath("/kit");
}

export async function deleteRule(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { data: existing } = await ctx.supabase
    .from("kit_rules")
    .select("kit_version_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return;

  const versionError = await assertDraftVersion(ctx.supabase, existing.kit_version_id);
  if (versionError) return;

  await ctx.supabase.from("kit_rules").delete().eq("id", id);
  revalidatePath("/kit");
}

export async function publishDraft(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };

  const kitId = String(formData.get("kit_id") ?? "");
  const draftId = String(formData.get("draft_id") ?? "");
  if (!kitId || !draftId) return { error: "Missing kit or draft." };

  const { data: draft } = await ctx.supabase
    .from("kit_versions")
    .select("kit_id, version_number, status")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft || draft.kit_id !== kitId || draft.status !== "draft") {
    return { error: "Draft not found." };
  }

  const { count } = await ctx.supabase
    .from("kit_rules")
    .select("id", { count: "exact", head: true })
    .eq("kit_version_id", draftId);
  if (!count || count === 0) {
    return { error: "Add at least one rule before publishing." };
  }

  const { error: publishError } = await ctx.supabase
    .from("kit_versions")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", draftId);
  if (publishError) return { error: publishError.message };

  const { error: currentError } = await ctx.supabase
    .from("brand_kits")
    .update({ current_version_id: draftId })
    .eq("id", kitId);
  if (currentError) return { error: currentError.message };

  updateTag(`kitver-${draftId}`);
  updateTag(`ws-${ctx.workspaceId}`);
  revalidatePath("/kit");
  return { message: `v${draft.version_number} published — it is now the version checks run against.` };
}

export async function discardDraft(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return;

  const draftId = String(formData.get("draft_id") ?? "");
  if (!draftId) return;

  const { data: draft } = await ctx.supabase
    .from("kit_versions")
    .select("status")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft || draft.status !== "draft") return;

  await ctx.supabase.from("kit_versions").delete().eq("id", draftId);
  revalidatePath("/kit");
}
