import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { runChecks } from "@/lib/checks/run";

/**
 * Per-user rate limit (per server instance) — protects the shared Gemini
 * quota on a public demo link from scripted spam. Deterrence, not a hard
 * guarantee: instances are stateless on serverless platforms.
 *
 * The 429 gate runs early (cheap spam rejection), but a slot is only
 * consumed by `recordRun` when the AI pipeline actually starts — so
 * validation failures (bad body, missing item, unpublished kit) don't eat a
 * judge's budget.
 */
const RATE_LIMIT = { max: 3, windowMs: 5 * 60 * 1000 };
const checkRuns = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (checkRuns.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  checkRuns.set(userId, recent);
  return recent.length >= RATE_LIMIT.max;
}

function recordRun(userId: string): void {
  const now = Date.now();
  const recent = (checkRuns.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  checkRuns.set(userId, recent);
}

/**
 * Creates a check job for a content item and runs the pipeline.
 * Auth: signed-in user; the item must be visible to them (RLS-scoped read).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (rateLimited(user.id)) {
    return NextResponse.json(
      { error: "Too many check runs — wait a few minutes and try again." },
      { status: 429 },
    );
  }

  let itemId: string;
  try {
    const body = (await request.json()) as { content_item_id?: string };
    itemId = String(body.content_item_id ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!itemId) {
    return NextResponse.json({ error: "content_item_id is required." }, { status: 400 });
  }

  // RLS scopes this read to the user's workspace — invisible items 404 here.
  const { data: item } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: "Content item not found." }, { status: 404 });
  }

  const { data: version } = await supabase
    .from("kit_versions")
    .select("status")
    .eq("id", item.kit_version_id)
    .maybeSingle();
  if (!version || version.status !== "published") {
    return NextResponse.json(
      { error: "Content must reference a published kit version." },
      { status: 400 },
    );
  }

  const { data: check, error: checkError } = await supabase
    .from("checks")
    .insert({
      content_item_id: item.id,
      status: "queued",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (checkError || !check) {
    return NextResponse.json(
      { error: checkError?.message ?? "Could not create check." },
      { status: 500 },
    );
  }

  await supabase.from("content_items").update({ status: "checking" }).eq("id", item.id);

  const startedAt = Date.now();
  recordRun(user.id);
  try {
    const summary = await runChecks(supabase, item, check.id);
    return NextResponse.json({
      check_id: check.id,
      duration_ms: Date.now() - startedAt,
      ...summary,
    });
  } catch (error) {
    await supabase
      .from("checks")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", check.id);
    await supabase.from("content_items").update({ status: "failed" }).eq("id", item.id);
    return NextResponse.json({ error: "Check failed — see the item for status." }, { status: 500 });
  }
}
