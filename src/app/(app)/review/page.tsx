import Link from "next/link";
import { redirect } from "next/navigation";

import { ConfidenceMeter, SevChip, SevRail, StatusPill } from "@/components/indicators";
import { createClient } from "@/lib/supabase/server";
import { STATUS_VARIANT } from "@/lib/types";

// Session-reading page (Cache Components opt-out).
export const instant = false;

export default async function ReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role;

  if (role !== "reviewer" && role !== "approver" && role !== "admin") {
    return (
      <div className="mx-auto max-w-xl pt-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="font-semibold">Reviewer queue</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This queue is for reviewers, approvers and admins. Creators work from the
            item pages and their fix decisions.
          </p>
        </div>
      </div>
    );
  }

  const [{ data: awaiting }, { data: withCreators }, { data: openFindings }] = await Promise.all([
    supabase
      .from("content_items")
      .select("id, source_kind, context_type, status, created_at")
      .eq("status", "in_review")
      .order("created_at", { ascending: false }),
    supabase
      .from("content_items")
      .select("id, source_kind, context_type, status, created_at")
      .in("status", ["needs_changes", "returned"])
      .order("created_at", { ascending: false }),
    supabase
      .from("findings")
      .select(
        "id, content_item_id, title, explanation, severity, needs_human, created_at, kit_rule_id, status, confidence",
      )
      .eq("assigned_to_role", "reviewer")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
  ]);

  const [{ data: routedItems }, { data: routedRules }] = await Promise.all([
    openFindings?.length
      ? supabase
          .from("content_items")
          .select("id, source_kind, context_type, status")
          .in("id", [...new Set(openFindings.map((f) => f.content_item_id))])
      : Promise.resolve({ data: [] }),
    openFindings?.length
      ? supabase
          .from("kit_rules")
          .select("id, name")
          .in(
            "id",
            openFindings.map((f) => f.kit_rule_id).filter((v): v is string => Boolean(v)),
          )
      : Promise.resolve({ data: [] }),
  ]);
  const itemMap = new Map((routedItems ?? []).map((i) => [i.id, i]));
  const ruleMap = new Map((routedRules ?? []).map((r) => [r.id, r.name]));

  return (
    <div className="mx-auto max-w-[1120px] space-y-5 pb-12">
      <div>
        <h1 className="text-[17px] font-semibold tracking-tight">Review</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Findings routed to you by type and confidence, and items waiting for a verdict.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-[13px] font-semibold">Routed to reviewers</span>
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {openFindings?.length ?? 0}
          </span>
        </div>
        <div className="space-y-2.5 px-4 py-4">
          {!openFindings || openFindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing routed to reviewers right now.
            </p>
          ) : (
            openFindings.map((finding) => {
              const item = itemMap.get(finding.content_item_id);
              const ruleName = finding.kit_rule_id ? ruleMap.get(finding.kit_rule_id) : null;
              return (
                <SevRail key={finding.id} severity={finding.severity}>
                  <div className="p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <SevChip severity={finding.severity} />
                      <span className="text-[13px] font-semibold">{finding.title}</span>
                      {finding.needs_human && (
                        <span className="rounded-md border border-warning-border bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-warning">
                          needs human
                        </span>
                      )}
                      {item && <StatusPill status={item.status} />}
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-muted-foreground">{finding.explanation}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {finding.confidence !== null && <ConfidenceMeter value={finding.confidence} />}
                      {ruleName && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-1.5 py-0.5 font-semibold text-primary">
                          ⚡ {ruleName}
                        </span>
                      )}
                      {item && (
                        <Link
                          href={`/items/${item.id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          open {item.source_kind} item ({item.context_type.replace("_", " ")})
                        </Link>
                      )}
                    </p>
                  </div>
                </SevRail>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-[13px] font-semibold">Awaiting final verdict</span>
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {awaiting?.length ?? 0}
          </span>
        </div>
        <div className="px-4 py-4">
          {!awaiting || awaiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">The queue is empty.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              {awaiting.map((item) => (
                <Link
                  key={item.id}
                  href={`/items/${item.id}`}
                  className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 transition-colors last:border-none hover:bg-secondary/60"
                >
                  <span className="flex items-center gap-2.5 text-[13px] font-medium">
                    {item.source_kind === "text" ? "Text" : "Image"} ·{" "}
                    {item.context_type.replace("_", " ")}
                    <StatusPill status={item.status} />
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(item.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-[13px] font-semibold">With creators</span>
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {withCreators?.length ?? 0}
          </span>
        </div>
        <div className="px-4 py-4">
          {!withCreators || withCreators.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is with creators right now.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Returned items or items carrying creator-fixable findings — visible here for
              context; the verdict comes after they resubmit.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
