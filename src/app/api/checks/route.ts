import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { runChecks } from "@/lib/checks/run";

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
