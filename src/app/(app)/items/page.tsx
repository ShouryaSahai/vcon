import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { NoWorkspaceNotice } from "@/components/no-workspace-notice";
import { createClient } from "@/lib/supabase/server";
import type { Severity } from "@/lib/db-types";

import { ItemsBrowser, type ListItem } from "./items-browser";

export default async function ItemsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return <NoWorkspaceNotice />;
  }

  const [{ data: items }, { data: allFindings }, { data: kit }] = await Promise.all([
    supabase
      .from("content_items")
      .select("id, source_kind, context_type, status, created_at, text_content, alt_text")
      .order("created_at", { ascending: false }),
    supabase.from("findings").select("content_item_id, severity, status"),
    supabase.from("brand_kits").select("current_version_id").limit(1).maybeSingle(),
  ]);

  const { data: currentVersion } = kit?.current_version_id
    ? await supabase
        .from("kit_versions")
        .select("version_number")
        .eq("id", kit.current_version_id)
        .maybeSingle()
    : { data: null };
  const kitLabel = currentVersion ? `Kit v${currentVersion.version_number}` : "no kit";

  const countsByItem = new Map<string, Record<Severity, number>>();
  for (const f of allFindings ?? []) {
    if (f.status !== "open") continue;
    const rec = countsByItem.get(f.content_item_id) ?? { high: 0, medium: 0, low: 0 };
    const sev = (["high", "medium", "low"] as Severity[]).includes(f.severity as Severity)
      ? (f.severity as Severity)
      : "medium";
    rec[sev] += 1;
    countsByItem.set(f.content_item_id, rec);
  }

  const listItems: ListItem[] = (items ?? []).map((i) => {
    const counts = countsByItem.get(i.id) ?? { high: 0, medium: 0, low: 0 };
    const flagged = counts.high > 0;
    const rawText = (i.text_content ?? "").trim();
    const wordCount = rawText ? rawText.split(/\s+/).length : 0;
    const charCount = rawText.length;
    const snippet =
      i.source_kind === "text" || i.source_kind === "docx"
        ? rawText.slice(0, 120) || "Document upload — empty text"
        : i.alt_text
          ? `Alt text: ${i.alt_text.slice(0, 100)}`
          : "Image upload — no alt text yet";
    return {
      id: i.id,
      source_kind: i.source_kind,
      context_type: i.context_type,
      status: i.status,
      created_at: i.created_at,
      snippet,
      flagged,
      counts,
      wordCount,
      charCount,
    };
  });

  return (
    <div className="mx-auto max-w-[1160px] space-y-5 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              GOVERNANCE QUEUE
            </span>
            <span className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground">
              {kitLabel}
            </span>
          </div>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight">Content items</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Every asset evaluated against the active brand kit — deterministic + AI compliance log.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/insights"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 font-mono text-[11.5px] font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Insights
          </Link>
          <Link
            href="/upload"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 active:translate-y-px"
          >
            <Plus className="h-3.5 w-3.5" />
            New check
          </Link>
        </div>
      </div>

      <ItemsBrowser items={listItems} kitLabel={kitLabel} />
    </div>
  );
}
