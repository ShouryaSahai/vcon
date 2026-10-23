import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DecisionAction } from "@/lib/db-types";
import { createClient } from "@/lib/supabase/server";
import { DECISION_LABELS, RULE_TYPE_LABELS, STATUS_VARIANT } from "@/lib/types";

import {
  acceptFix,
  addComment,
  decideItem,
  overrideFinding,
  rejectFix,
} from "./actions";
import { CopyButton } from "./copy-button";
import { ResubmitForm } from "./resubmit-form";

// Session-reading page (Cache Components opt-out).
export const instant = false;

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

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
  if (!profile) redirect("/login");
  const role = profile.role;
  const isCreator = role === "creator" || role === "admin";
  const isReviewer = role === "reviewer" || role === "approver" || role === "admin";
  const isApprover = role === "approver" || role === "admin";

  // RLS scopes this read to the item's workspace.
  const { data: item } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!item) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Item not found</CardTitle>
          <CardDescription>
            It either does not exist or belongs to another workspace (RLS enforced).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { data: version } = await supabase
    .from("kit_versions")
    .select("version_number, status")
    .eq("id", item.kit_version_id)
    .maybeSingle();

  const { data: rules } = await supabase
    .from("kit_rules")
    .select("id, name, rule_type")
    .eq("kit_version_id", item.kit_version_id);
  const ruleMap = new Map((rules ?? []).map((r) => [r.id, r]));

  const { data: findings } = await supabase
    .from("findings")
    .select("*")
    .eq("content_item_id", item.id)
    .order("created_at");

  const { data: comments } = await supabase
    .from("comments")
    .select("id, author_id, body, created_at")
    .eq("content_item_id", item.id)
    .order("created_at", { ascending: true });

  const { data: decisions } = await supabase
    .from("decision_log")
    .select("id, finding_id, actor_id, action, reason, created_at")
    .eq("content_item_id", item.id)
    .order("created_at", { ascending: false });

  const { data: children } = await supabase
    .from("content_items")
    .select("id, created_at, status")
    .eq("parent_item_id", item.id)
    .order("created_at", { ascending: false });

  const { data: checks } = await supabase
    .from("checks")
    .select("id, status, error, summary, started_at, finished_at")
    .eq("content_item_id", item.id)
    .order("created_at", { ascending: false });

  // Actor names for comments + decisions.
  const authorIds = new Set<string>();
  for (const c of comments ?? []) authorIds.add(c.author_id);
  for (const d of decisions ?? []) authorIds.add(d.actor_id);
  const { data: actors } = authorIds.size
    ? await supabase.from("profiles").select("id, full_name").in("id", [...authorIds])
    : { data: [] };
  const nameOf = new Map((actors ?? []).map((a) => [a.id, a.full_name || "Member"]));

  // Signed URL for images — the bucket is private; RLS authorises this read.
  let imageUrl: string | null = null;
  if (item.storage_path) {
    const { data: signed } = await supabase.storage
      .from("content")
      .createSignedUrl(item.storage_path, 3600);
    imageUrl = signed?.signedUrl ?? null;
  }

  const openCount = (findings ?? []).filter((f) => f.status === "open").length;
  const canResubmit =
    isCreator &&
    (item.created_by === user.id || role === "admin") &&
    (item.status === "needs_changes" || item.status === "returned");

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {item.source_kind === "text" ? "Text" : "Image"} ·{" "}
            {item.context_type.replace("_", " ")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Date(item.created_at).toLocaleString()} · checked against kit v
            {version?.version_number ?? "?"} ({version?.status ?? "unknown"}) · {openCount} open
            finding{openCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {item.parent_item_id && (
            <Link
              href={`/items/${item.parent_item_id}`}
              className="text-xs text-slate-500 underline-offset-4 hover:underline"
            >
              ← previous version
            </Link>
          )}
          <Badge variant={STATUS_VARIANT[item.status]}>{item.status.replace("_", " ")}</Badge>
        </div>
      </div>

      {children && children.length > 0 && (
        <p className="text-sm text-slate-600">
          Resubmitted as{" "}
          {children.map((child, index) => (
            <span key={child.id}>
              {index > 0 && ", "}
              <Link
                href={`/items/${child.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                #{child.id.slice(0, 8)}
              </Link>{" "}
              <Badge variant={STATUS_VARIANT[child.status]}>
                {child.status.replace("_", " ")}
              </Badge>
            </span>
          ))}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {item.source_kind === "text" ? (
            <p className="whitespace-pre-wrap text-sm text-slate-800">{item.text_content}</p>
          ) : imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageUrl}
              alt={item.alt_text ?? ""}
              className="max-h-80 rounded-lg border border-slate-200"
            />
          ) : (
            <p className="text-sm text-slate-500">Image stored but no preview available.</p>
          )}
          {item.source_kind === "image" && (
            <p className="text-xs text-slate-500">Alt text: {item.alt_text || "—"}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Findings</CardTitle>
          <CardDescription>
            {findings && findings.length > 0
              ? `${findings.length} finding${findings.length === 1 ? "" : "s"} — every flag cites its rule.`
              : "No findings — the content matched the brand kit."}
          </CardDescription>
        </CardHeader>
        {findings && findings.length > 0 && (
          <CardContent className="space-y-3">
            {findings.map((finding) => {
              const rule = finding.kit_rule_id ? ruleMap.get(finding.kit_rule_id) : null;
              const loc = (finding.location ?? {}) as {
                type?: string;
                start?: number;
                end?: number;
                excerpt?: string;
                dominant?: string;
                nearest?: { name: string; hex: string; delta_e: number };
                limit?: number;
              };
              const fixText = finding.suggested_fix ?? "";
              return (
                <div key={finding.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{finding.title}</span>
                    <Badge variant={finding.severity === "high" ? "destructive" : "secondary"}>
                      {finding.severity}
                    </Badge>
                    <Badge variant="outline">
                      {finding.source === "ai" ? "AI check" : "rule engine"}
                    </Badge>
                    {finding.needs_human && <Badge variant="outline">needs human</Badge>}
                    {finding.status !== "open" && (
                      <Badge variant="secondary">{finding.status.replace("_", " ")}</Badge>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-slate-700">{finding.explanation}</p>

                  {loc.type === "text" && loc.excerpt && (
                    <blockquote className="mt-2 rounded border-l-4 border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
                      {loc.excerpt}
                    </blockquote>
                  )}
                  {loc.type === "image_palette" && loc.nearest && (
                    <p className="mt-2 text-xs text-slate-500">
                      Dominant {loc.dominant} · nearest “{loc.nearest.name}” ({loc.nearest.hex}) ·
                      ΔE {loc.nearest.delta_e} (limit {loc.limit})
                    </p>
                  )}

                  {rule && (
                    <p className="mt-2 text-xs text-slate-500">
                      Rule: <span className="font-medium text-slate-700">{rule.name}</span> ·{" "}
                      {RULE_TYPE_LABELS[rule.rule_type]}
                    </p>
                  )}

                  {fixText && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 px-3 py-2">
                      <span className="text-sm text-emerald-900">{fixText}</span>
                      <CopyButton text={fixText} />
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {finding.status === "open" && isCreator && item.status !== "approved" && (
                      <>
                        {fixText && (
                          <form action={acceptFix}>
                            <input type="hidden" name="item_id" value={item.id} />
                            <input type="hidden" name="finding_id" value={finding.id} />
                            <Button size="sm" type="submit">
                              Accept fix
                            </Button>
                          </form>
                        )}
                        <form action={rejectFix}>
                          <input type="hidden" name="item_id" value={item.id} />
                          <input type="hidden" name="finding_id" value={finding.id} />
                          <Button size="sm" variant="outline" type="submit">
                            Reject
                          </Button>
                        </form>
                      </>
                    )}
                    {finding.status === "open" && isReviewer && (
                      <details className="w-full">
                        <summary className="cursor-pointer text-xs text-slate-500">
                          Override this flag…
                        </summary>
                        <form
                          action={overrideFinding}
                          className="mt-2 flex flex-wrap items-end gap-2"
                        >
                          <input type="hidden" name="item_id" value={item.id} />
                          <input type="hidden" name="finding_id" value={finding.id} />
                          <div className="space-y-1">
                            <Label htmlFor={`reason-${finding.id}`}>Reason (required)</Label>
                            <Input
                              id={`reason-${finding.id}`}
                              name="reason"
                              className="w-72"
                              placeholder="Why is this flag being overridden?"
                            />
                          </div>
                          <Button size="sm" variant="destructive" type="submit">
                            Override
                          </Button>
                        </form>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>

      {canResubmit && (
        <Card>
          <CardHeader>
            <CardTitle>Resubmit with corrections</CardTitle>
            <CardDescription>
              A resubmission is a new item linked to this one, re-checked against the same kit
              version.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResubmitForm
              itemId={item.id}
              sourceKind={item.source_kind}
              initialText={item.text_content}
              initialAlt={item.alt_text}
            />
          </CardContent>
        </Card>
      )}

      {isApprover && item.status !== "approved" && (
        <Card>
          <CardHeader>
            <CardTitle>Final verdict</CardTitle>
            <CardDescription>Humans decide — Vcon never publishes anything.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <form action={decideItem} className="flex items-end gap-2">
                <input type="hidden" name="item_id" value={item.id} />
                <input type="hidden" name="decision" value="approved" />
                <Button type="submit">Approve</Button>
              </form>
              <form action={decideItem} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="item_id" value={item.id} />
                <input type="hidden" name="decision" value="returned" />
                <div className="space-y-1">
                  <Label htmlFor="return-reason">Reason (for returning)</Label>
                  <Input
                    id="return-reason"
                    name="reason"
                    className="w-72"
                    placeholder="What must change?"
                  />
                </div>
                <Button type="submit" variant="outline">
                  Return
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Comments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {comments && comments.length > 0 ? (
            <div className="space-y-2">
              {comments.map((comment) => (
                <div key={comment.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">
                    {nameOf.get(comment.author_id) ?? "Member"} ·{" "}
                    {new Date(comment.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1 text-sm text-slate-800">{comment.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No comments yet.</p>
          )}
          <form action={addComment} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="item_id" value={item.id} />
            <div className="flex-1 space-y-1">
              <Label htmlFor="comment-body">Add a comment</Label>
              <Textarea id="comment-body" name="body" rows={2} required />
            </div>
            <Button type="submit" size="sm">
              Comment
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Decisions are append-only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {decisions && decisions.length > 0 ? (
              decisions.map((decision) => (
                <div key={decision.id} className="text-sm">
                  <span className="font-medium text-slate-900">
                    {DECISION_LABELS[decision.action as DecisionAction]}
                  </span>{" "}
                  <span className="text-slate-500">
                    by {nameOf.get(decision.actor_id) ?? "Member"} ·{" "}
                    {new Date(decision.created_at).toLocaleString()}
                  </span>
                  {decision.reason && (
                    <span className="text-slate-700"> — “{decision.reason}”</span>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No decisions yet.</p>
            )}
          </div>
          <div className="space-y-1 border-t border-slate-100 pt-3">
            {(checks ?? []).map((check) => (
              <div
                key={check.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="font-mono text-xs text-slate-500">{check.id.slice(0, 8)}</span>
                <Badge
                  variant={
                    check.status === "done"
                      ? "secondary"
                      : check.status === "failed"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {check.status}
                </Badge>
                <span className="text-xs text-slate-500">
                  {check.started_at ? new Date(check.started_at).toLocaleTimeString() : "—"}
                  {check.finished_at
                    ? ` → ${new Date(check.finished_at).toLocaleTimeString()}`
                    : " → …"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Link href="/items" className="text-sm text-slate-600 underline-offset-4 hover:underline">
        ← All items
      </Link>
    </div>
  );
}
