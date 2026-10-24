import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Reviewer queue</CardTitle>
          <CardDescription>
            This queue is for reviewers, approvers and admins. Creators work from the
            item pages and their fix decisions.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // 1) Items in the review flow + 2) findings routed to reviewers — in parallel.
  const [{ data: awaiting }, { data: openFindings }] = await Promise.all([
    supabase
      .from("content_items")
      .select("id, source_kind, context_type, status, created_at")
      .in("status", ["in_review", "needs_changes", "returned"])
      .order("created_at", { ascending: false }),
    supabase
      .from("findings")
      .select(
        "id, content_item_id, title, explanation, severity, needs_human, created_at, kit_rule_id, status",
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Reviewer queue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Items waiting for a verdict, and findings routed to reviewers by type and confidence.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Findings routed to reviewers</CardTitle>
          <CardDescription>
            Claims, facts and low-confidence flags — a human confirms them before they count.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!openFindings || openFindings.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing routed to reviewers right now.</p>
          ) : (
            openFindings.map((finding) => {
              const item = itemMap.get(finding.content_item_id);
              const ruleName = finding.kit_rule_id ? ruleMap.get(finding.kit_rule_id) : null;
              return (
                <div key={finding.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={finding.severity === "high" ? "destructive" : "secondary"}>
                      {finding.severity}
                    </Badge>
                    <span className="text-sm font-medium text-slate-900">{finding.title}</span>
                    {finding.needs_human && <Badge variant="outline">needs human</Badge>}
                    {item && (
                      <Badge variant={STATUS_VARIANT[item.status]}>
                        {item.status.replace("_", " ")}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{finding.explanation}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ruleName ? `Rule: ${ruleName} · ` : ""}
                    {item ? (
                      <Link
                        href={`/items/${item.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        open {item.source_kind} item ({item.context_type.replace("_", " ")})
                      </Link>
                    ) : (
                      "item unavailable"
                    )}
                  </p>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Awaiting final verdict</CardTitle>
          <CardDescription>
            {awaiting?.length ?? 0} item{(awaiting?.length ?? 0) === 1 ? "" : "s"} in the review
            flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!awaiting || awaiting.length === 0 ? (
            <p className="text-sm text-slate-500">The queue is empty.</p>
          ) : (
            awaiting.map((item) => (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-slate-300"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {item.source_kind === "text" ? "Text" : "Image"} ·{" "}
                    {item.context_type.replace("_", " ")}
                  </span>
                  <Badge variant={STATUS_VARIANT[item.status]}>
                    {item.status.replace("_", " ")}
                  </Badge>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
