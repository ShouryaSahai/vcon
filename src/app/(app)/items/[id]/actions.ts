"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ContentItem, FindingStatus, UserRole } from "@/lib/db-types";
import { createClient } from "@/lib/supabase/server";
import { runChecks } from "@/lib/checks/run";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function requireMember(): Promise<
  { error: string } | { supabase: SupabaseServerClient; userId: string; role: UserRole }
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
  if (!profile?.workspace_id) return { error: "No workspace assigned." };
  return { supabase, userId: user.id, role: profile.role };
}

function back(itemId: string, message?: string): never {
  redirect(`/items/${itemId}${message ? `?error=${encodeURIComponent(message)}` : ""}`);
}

/** Loads the item via RLS (invisible items abort) and returns it with the actor. */
async function loadItem(
  supabase: SupabaseServerClient,
  itemId: string,
): Promise<ContentItem | null> {
  const { data: item } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  return item ?? null;
}

function isCreator(role: UserRole): boolean {
  return role === "creator" || role === "admin";
}
function isReviewer(role: UserRole): boolean {
  return role === "reviewer" || role === "approver" || role === "admin";
}
function isApprover(role: UserRole): boolean {
  return role === "approver" || role === "admin";
}

async function setFindingStatus(
  supabase: SupabaseServerClient,
  itemId: string,
  findingId: string,
  status: FindingStatus,
  action: "fix_accepted" | "fix_rejected" | "override",
  actorId: string,
  reason?: string,
): Promise<void> {
  const { error } = await supabase
    .from("findings")
    .update({ status })
    .eq("id", findingId);
  if (error) back(itemId, error.message);

  const { error: logError } = await supabase.from("decision_log").insert({
    content_item_id: itemId,
    finding_id: findingId,
    actor_id: actorId,
    action,
    reason: reason ?? null,
  });
  if (logError) back(itemId, logError.message);

  revalidatePath(`/items/${itemId}`);
}

// ===== Creator decisions =====================================================

export async function acceptFix(formData: FormData): Promise<void> {
  const ctx = await requireMember();
  if ("error" in ctx) return;
  const itemId = String(formData.get("item_id") ?? "");
  const findingId = String(formData.get("finding_id") ?? "");
  if (!itemId || !findingId) return;
  if (!isCreator(ctx.role)) back(itemId, "Only creators (or admins) accept or reject fixes.");

  const item = await loadItem(ctx.supabase, itemId);
  if (!item) back(itemId, "Item not found.");
  if (item!.status === "approved") back(itemId, "This item is already approved.");

  await setFindingStatus(
    ctx.supabase,
    itemId,
    findingId,
    "fix_accepted",
    "fix_accepted",
    ctx.userId,
  );
}

export async function rejectFix(formData: FormData): Promise<void> {
  const ctx = await requireMember();
  if ("error" in ctx) return;
  const itemId = String(formData.get("item_id") ?? "");
  const findingId = String(formData.get("finding_id") ?? "");
  if (!itemId || !findingId) return;
  if (!isCreator(ctx.role)) back(itemId, "Only creators (or admins) accept or reject fixes.");

  const item = await loadItem(ctx.supabase, itemId);
  if (!item) back(itemId, "Item not found.");
  if (item!.status === "approved") back(itemId, "This item is already approved.");

  await setFindingStatus(
    ctx.supabase,
    itemId,
    findingId,
    "fix_rejected",
    "fix_rejected",
    ctx.userId,
  );
}

// ===== Reviewer override =====================================================

export async function overrideFinding(formData: FormData): Promise<void> {
  const ctx = await requireMember();
  if ("error" in ctx) return;
  const itemId = String(formData.get("item_id") ?? "");
  const findingId = String(formData.get("finding_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!itemId || !findingId) return;
  if (!isReviewer(ctx.role)) back(itemId, "Only reviewers or approvers can override a flag.");
  if (!reason) back(itemId, "An override requires a reason.");

  await setFindingStatus(
    ctx.supabase,
    itemId,
    findingId,
    "overridden",
    "override",
    ctx.userId,
    reason,
  );
}

// ===== Approver verdict ======================================================

export async function decideItem(formData: FormData): Promise<void> {
  const ctx = await requireMember();
  if ("error" in ctx) return;
  const itemId = String(formData.get("item_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!itemId || (decision !== "approved" && decision !== "returned")) return;
  if (!isApprover(ctx.role)) back(itemId, "Only approvers (or admins) give the final verdict.");

  const item = await loadItem(ctx.supabase, itemId);
  if (!item) back(itemId, "Item not found.");
  if (item!.status === "approved") back(itemId, "Already approved.");
  if (item!.status === "checking") back(itemId, "Still checking — wait for it to finish.");

  const { error } = await ctx.supabase
    .from("content_items")
    .update({ status: decision })
    .eq("id", itemId);
  if (error) back(itemId, error.message);

  await ctx.supabase.from("decision_log").insert({
    content_item_id: itemId,
    actor_id: ctx.userId,
    action: decision,
    reason,
  });

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/items");
  revalidatePath("/review");
}

// ===== Comments ==============================================================

export async function addComment(formData: FormData): Promise<void> {
  const ctx = await requireMember();
  if ("error" in ctx) return;
  const itemId = String(formData.get("item_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!itemId || !body) return;

  const { error } = await ctx.supabase.from("comments").insert({
    content_item_id: itemId,
    author_id: ctx.userId,
    body,
  });
  if (error) back(itemId, error.message);

  revalidatePath(`/items/${itemId}`);
}

// ===== Resubmission ==========================================================

export async function resubmitItem(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await requireMember();
  if ("error" in ctx) return { error: ctx.error };

  const itemId = String(formData.get("item_id") ?? "");
  const text = String(formData.get("text_content") ?? "").trim() || null;
  const alt = String(formData.get("alt_text") ?? "").trim() || null;
  if (!itemId) return { error: "Missing item." };
  if (!isCreator(ctx.role)) return { error: "Only creators (or admins) resubmit content." };

  const item = await loadItem(ctx.supabase, itemId);
  if (!item) return { error: "Item not found." };
  if (item!.created_by !== ctx.userId && ctx.role !== "admin") {
    return { error: "Only the item's creator can resubmit it." };
  }
  if (item!.status === "checking") return { error: "Still checking — wait for it to finish." };

  if (item!.source_kind === "text" && !text) {
    return { error: "The corrected text is required." };
  }
  if (item!.source_kind === "image" && (!alt || alt.length < 20)) {
    return { error: "Alt text is required (at least 20 characters)." };
  }

  // New item, linked to the one it replaces. Images reuse the stored object.
  const { data: next, error: insertError } = await ctx.supabase
    .from("content_items")
    .insert({
      workspace_id: item!.workspace_id,
      kit_version_id: item!.kit_version_id,
      created_by: ctx.userId,
      context_type: item!.context_type,
      source_kind: item!.source_kind,
      storage_path: item!.storage_path,
      text_content: text,
      alt_text: alt,
      parent_item_id: item!.id,
    })
    .select("*")
    .single();
  if (insertError || !next) {
    return { error: insertError?.message ?? "Could not create the resubmission." };
  }

  // Re-check against the same kit version.
  const { data: check, error: checkError } = await ctx.supabase
    .from("checks")
    .insert({
      content_item_id: next.id,
      status: "queued",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (checkError || !check) {
    return { error: checkError?.message ?? "Could not start the re-check." };
  }

  await ctx.supabase.from("content_items").update({ status: "checking" }).eq("id", next.id);
  await runChecks(ctx.supabase, next, check.id);

  revalidatePath("/items");
  revalidatePath(`/items/${itemId}`);
  redirect(`/items/${next.id}`);
}
