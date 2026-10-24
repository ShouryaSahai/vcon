import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ConfidenceMeter,
  HighlightedText,
  SevChip,
  SevRail,
  StatusPill,
} from "@/components/indicators";
import type { DecisionAction } from "@/lib/db-types";
import { createClient } from "@/lib/supabase/server";
import { getKitContext } from "@/lib/cached";
import { fmtDateTime, fmtDateTimeFull, fmtTime, fmtTimeShort } from "@/lib/format";
import { DECISION_LABELS } from "@/lib/types";

import { acceptFix, addComment, decideItem, overrideFinding, rejectFix } from "./actions";
import { CopyButton } from "./copy-button";
import { ResubmitForm } from "./resubmit-form";

const CHECKER_LABELS: Record<string, string> = {
  banned_term: "Banned terms",
  required_term: "Required terms",
  disclaimer: "Disclaimers",
  alt_text_policy: "Alt text",
  brand_color: "Palette match",
  ai: "Tone · claims · terms (AI)",
};

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

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? "";

  const [{ data: profile }, { data: item }] = await Promise.all([
    supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle(),
    supabase.from("content_items").select("*").eq("id", id).maybeSingle(),
  ]);
  if (!profile) redirect("/login");
  const role = profile.role;
  const isCreator = role === "creator" || role === "admin";
  const isReviewer = role === "reviewer" || role === "approver" || role === "admin";
  const isApprover = role === "approver" || role === "admin";

  // RLS scopes this read to the item's workspace.
  if (!item) {
    return (
      <div className="mx-auto max-w-xl pt-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="font-semibold">Item not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It either does not exist or belongs to another workspace (RLS enforced).
          </p>
          <Link href="/items" className="mt-3 inline-block text-sm text-primary hover:underline">
            ← All items
          </Link>
        </div>
      </div>
    );
  }

  // Kit rules + version are cached per session (published versions are
  // immutable; publishing revalidates the tag).
  const [
    kit,
    { data: findings },
    { data: comments },
    { data: decisions },
    { data: children },
    { data: checks },
  ] = await Promise.all([
    accessToken
      ? getKitContext(accessToken, item.kit_version_id)
      : Promise.resolve({ version: null, rules: [] }),
    supabase.from("findings").select("*").eq("content_item_id", item.id).order("created_at"),
    supabase.from("comments").select("id, author_id, body, created_at").eq("content_item_id", item.id).order("created_at", { ascending: true }),
    supabase.from("decision_log").select("id, finding_id, actor_id, action, reason, created_at").eq("content_item_id", item.id).order("created_at", { ascending: false }),
    supabase.from("content_items").select("id, created_at, status").eq("parent_item_id", item.id).order("created_at", { ascending: false }),
    supabase.from("checks").select("id, status, error, summary, started_at, finished_at").eq("content_item_id", item.id).order("created_at", { ascending: false }),
  ]);
  const { version, rules } = kit;
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const sortedFindings = [...(findings ?? [])].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
    return (
      (rank[a.severity] ?? 1) - (rank[b.severity] ?? 1) ||
      a.created_at.localeCompare(b.created_at)
    );
  });

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
  const latestCheck = checks?.[0] ?? null;
  const latestSummary = (latestCheck?.summary ?? null) as {
    outcome?: string;
    incompleteReasons?: string[];
    checkers?: Record<string, string>;
  } | null;
  const incomplete =
    latestCheck?.status === "done" && latestSummary?.outcome === "incomplete";
  const checkDuration =
    latestCheck?.started_at && latestCheck?.finished_at
      ? `${((new Date(latestCheck.finished_at).getTime() - new Date(latestCheck.started_at).getTime()) / 1000).toFixed(1)} s`
      : null;
  const canResubmit =
    isCreator &&
    (item.created_by === user.id || role === "admin") &&
    (item.status === "needs_changes" || item.status === "returned");

  // Evidence ranges for inline caption highlighting.
  const highlightRanges = (findings ?? [])
    .filter((f) => {
      const loc = (f.location ?? {}) as { type?: string; start?: number; end?: number };
      return loc.type === "text" && typeof loc.start === "number" && typeof loc.end === "number";
    })
    .map((f) => {
      const loc = (f.location ?? {}) as { start: number; end: number };
      return { start: loc.start, end: loc.end, severity: f.severity };
    });

  return (
    <div className="mx-auto max-w-[1120px] space-y-5 pb-12">
      {error && (
        <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div>
        <Link
          href="/items"
          className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          ← Content
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-[17px] font-semibold tracking-tight">
              {item.source_kind === "text" ? "Text" : "Image"} ·{" "}
              {item.context_type.replace("_", " ")}
            </h1>
            <StatusPill status={item.status} />
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{fmtDateTimeFull(item.created_at)}</span>
          <span className="h-[3px] w-[3px] rounded-full bg-border" />
          <span>
            Checked against <span className="font-medium text-foreground">kit v{version?.version_number ?? "?"}</span>{" "}
            ({version?.status ?? "unknown"})
          </span>
          {item.parent_item_id && (
            <>
              <span className="h-[3px] w-[3px] rounded-full bg-border" />
              <Link
                href={`/items/${item.parent_item_id}`}
                className="underline-offset-4 hover:text-primary hover:underline"
              >
                previous version
              </Link>
            </>
          )}
          <span className="h-[3px] w-[3px] rounded-full bg-border" />
          <span>
            <span className="font-medium text-foreground">{openCount}</span> open finding
            {openCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {children && children.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Resubmitted as
          {children.map((child) => (
            <Link
              key={child.id}
              href={`/items/${child.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground hover:border-primary/40"
            >
              #{child.id.slice(0, 8)} <StatusPill status={child.status} />
            </Link>
          ))}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ======== LEFT: content, findings, comments ======== */}
        <div className="min-w-0 space-y-5">
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[13px] font-semibold">Content</span>
              <span className="text-[11px] text-muted-foreground">
                {item.source_kind === "image" ? "Image upload" : "Creator text"}
              </span>
            </div>
            <div className="px-4 py-4">
              {item.source_kind === "text" ? (
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
                  {item.text_content ? (
                    <HighlightedText text={item.text_content} ranges={highlightRanges} />
                  ) : (
                    <span className="text-muted-foreground">No text.</span>
                  )}
                </p>
              ) : imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={imageUrl}
                  alt={item.alt_text ?? ""}
                  className="max-h-80 rounded-lg border border-border"
                />
              ) : (
                <p className="text-sm text-muted-foreground">Image stored but no preview available.</p>
              )}
              {item.source_kind === "image" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Alt text: <span className="text-foreground">{item.alt_text || "—"}</span>
                </p>
              )}
            </div>
          </section>

          {incomplete && (
            <div className="rounded-xl border border-warning-border bg-warning-soft p-4">
              <p className="text-sm font-semibold text-warning">
                Check incomplete — this item is NOT a verified pass
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-warning/90">
                {(latestSummary?.incompleteReasons ?? []).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[13px] font-semibold">Findings</span>
              <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {openCount} open
              </span>
            </div>
            <div className="px-4 py-4">
              {findings === null ? (
                <p className="text-sm text-destructive">
                  Could not load findings — refresh to retry.
                </p>
              ) : findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {incomplete
                    ? "No findings recorded, but the latest check did not complete — see the warning above."
                    : "No findings — all configured checks ran and the content matched the kit."}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {sortedFindings.map((finding) => {
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
                    const inExcerptStart = Math.max(0, (loc.start ?? 0) - 24);
                    const exStart = (loc.start ?? 0) - inExcerptStart;
                    const exEnd = (loc.end ?? 0) - inExcerptStart;
                    const decided = finding.status !== "open";
                    return (
                      <SevRail key={finding.id} severity={finding.severity}>
                        <div className="p-3.5 pl-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <SevChip severity={finding.severity} />
                            <span className="text-[13px] font-semibold">{finding.title}</span>
                            <span className="ml-auto flex items-center gap-1.5">
                              <span className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                                {finding.source === "ai" ? "AI check" : "Rule engine"}
                              </span>
                              {rule && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-[10.5px] font-semibold text-primary">
                                  ⚡ {rule.name}
                                </span>
                              )}
                            </span>
                          </div>

                          <p className="mt-2 text-[12.5px] text-muted-foreground">
                            {finding.explanation}
                          </p>

                          {loc.type === "text" && loc.excerpt && (
                            <div className="mt-2.5 rounded-lg border border-border bg-secondary/60 px-3 py-2">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                                Evidence{typeof loc.start === "number" ? ` — location ${loc.start}–${loc.end}` : ""}
                              </span>
                              <span className="mt-0.5 block text-[12.5px]">
                                <HighlightedText
                                  text={loc.excerpt}
                                  ranges={[
                                    {
                                      start: exStart,
                                      end: exEnd,
                                      severity: finding.severity,
                                    },
                                  ]}
                                />
                              </span>
                            </div>
                          )}
                          {loc.type === "image_palette" && loc.nearest && (
                            <p className="mt-2.5 text-xs text-muted-foreground">
                              Dominant <span className="font-mono text-foreground">{loc.dominant}</span> ·
                              nearest “{loc.nearest.name}” ({loc.nearest.hex}) · ΔE {loc.nearest.delta_e}{" "}
                              (limit {loc.limit})
                            </p>
                          )}

                          {fixText && (
                            <div className="mt-2.5 rounded-lg border border-success-border bg-success-soft px-3 py-2">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-success">
                                Suggested fix
                              </span>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                <span className="text-[12.5px]">{fixText}</span>
                                <CopyButton text={fixText} />
                              </div>
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {finding.source === "ai" && finding.confidence !== null && (
                              <ConfidenceMeter value={finding.confidence} />
                            )}
                            {decided && (
                              <span
                                className={`text-[11px] font-semibold ${
                                  finding.status === "fix_accepted"
                                    ? "text-success"
                                    : finding.status === "fix_rejected"
                                      ? "text-muted-foreground"
                                      : "text-warning"
                                }`}
                              >
                                {finding.status === "fix_accepted" && "✓ Fix accepted"}
                                {finding.status === "fix_rejected" && "✕ Fix rejected"}
                                {finding.status === "overridden" && "⚑ Overridden"}
                              </span>
                            )}
                            {finding.status === "open" && isCreator &&
                              finding.assigned_to_role === "creator" &&
                              item.status !== "approved" && (
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
                                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
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
                                  <Button size="sm" variant="outline" type="submit">
                                    Override
                                  </Button>
                                </form>
                              </details>
                            )}
                            {finding.status === "open" && finding.assigned_to_role === "reviewer" && (
                              <span className="ml-auto text-[11px] italic text-muted-foreground">
                                Awaiting claims reviewer
                              </span>
                            )}
                          </div>
                        </div>
                      </SevRail>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {canResubmit && (
            <section className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <span className="text-[13px] font-semibold">Resubmit with corrections</span>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  Creates a new item linked to this one, re-checked against the same kit version.
                </p>
              </div>
              <div className="px-4 py-4">
                <ResubmitForm
                  itemId={item.id}
                  sourceKind={item.source_kind}
                  initialText={item.text_content}
                  initialAlt={item.alt_text}
                />
              </div>
            </section>
          )}

          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <span className="text-[13px] font-semibold">Comments</span>
            </div>
            <div className="space-y-2.5 px-4 py-4">
              {comments && comments.length > 0 ? (
                comments.map((comment) => (
                  <div key={comment.id} className="rounded-lg bg-secondary/70 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">
                      {nameOf.get(comment.author_id) ?? "Member"} ·{" "}
                      {fmtDateTime(comment.created_at)}
                    </p>
                    <p className="mt-1 text-[13px]">{comment.body}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              )}
              <form action={addComment} className="flex flex-wrap items-end gap-2 pt-1">
                <input type="hidden" name="item_id" value={item.id} />
                <div className="flex-1 space-y-1">
                  <Label htmlFor="comment-body">Add a comment</Label>
                  <Textarea id="comment-body" name="body" rows={2} required />
                </div>
                <Button type="submit" size="sm">
                  Comment
                </Button>
              </form>
            </div>
          </section>
        </div>

        {/* ======== RIGHT RAIL: verification, verdict, history ======== */}
        <div className="space-y-4 lg:sticky lg:top-5 self-start">
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[13px] font-semibold">Verification</span>
              {incomplete ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-warning">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Incomplete
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> Complete
                </span>
              )}
            </div>
            <div className="px-4 py-3">
              {latestSummary?.checkers ? (
                <>
                  {Object.entries(latestSummary.checkers).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between py-[5px] text-xs text-muted-foreground"
                    >
                      {CHECKER_LABELS[key] ?? key}
                      <span
                        className={`text-[10.5px] font-semibold ${
                          value === "ran"
                            ? "text-success"
                            : value === "failed"
                              ? "text-destructive"
                              : value === "skipped"
                                ? "text-warning"
                                : "text-muted-foreground/60"
                        }`}
                      >
                        {value === "not_applicable" ? "n/a" : value}
                      </span>
                    </div>
                  ))}
                  {checkDuration && (
                    <div className="mt-1.5 flex items-center justify-between border-t border-dashed border-border pt-2 text-xs text-muted-foreground">
                      Duration <span className="font-mono text-foreground">{checkDuration}</span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No completed check yet.</p>
              )}
            </div>
          </section>

          {isApprover && item.status !== "approved" && (
            <section className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <span className="text-[13px] font-semibold">Final verdict</span>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Vcon never publishes. Approval marks the item ready to export.
                </p>
              </div>
              <form action={decideItem} className="space-y-2.5">
                <input type="hidden" name="item_id" value={item.id} />
                <div className="space-y-1">
                  <Label htmlFor="return-reason">Note to creator (for returns)</Label>
                  <Input
                    id="return-reason"
                    name="reason"
                    placeholder="What must change?"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" name="decision" value="approved" className="flex-1">
                    Approve
                  </Button>
                  <Button
                    type="submit"
                    name="decision"
                    value="returned"
                    variant="outline"
                    className="flex-1"
                  >
                    Return
                  </Button>
                </div>
              </form>
            </section>
          )}

          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[13px] font-semibold">History</span>
              <span className="text-[10.5px] text-muted-foreground">append-only</span>
            </div>
            <div className="px-4 py-3">
              <ul className="space-y-0">
                {decisions && decisions.length > 0 ? (
                  decisions.map((decision) => (
                    <li
                      key={decision.id}
                      className="flex gap-2.5 border-b border-dashed border-border py-2 text-xs last:border-none"
                    >
                      <span className="pt-0.5 text-muted-foreground">
                        {decision.action === "fix_accepted" && "✓"}
                        {decision.action === "fix_rejected" && "✕"}
                        {decision.action === "override" && "⚑"}
                        {decision.action === "approved" && "●"}
                        {decision.action === "returned" && "↩"}
                      </span>
                      <span className="text-muted-foreground">
                        <b className="font-semibold text-foreground">
                          {DECISION_LABELS[decision.action as DecisionAction]}
                        </b>
                        {decision.finding_id ? "" : ""}
                        <br />
                        by {nameOf.get(decision.actor_id) ?? "Member"}
                        {decision.reason && (
                          <span> — “{decision.reason}”</span>
                        )}
                      </span>
                      <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">
                        {fmtTimeShort(decision.created_at)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-muted-foreground">No decisions yet.</li>
                )}
              </ul>
              <div className="mt-2 space-y-1 border-t border-dashed border-border pt-2.5">
                {(checks ?? []).map((check) => (
                  <div
                    key={check.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      {check.id.slice(0, 8)}
                    </span>
                    <span
                      className={`text-[10.5px] font-semibold ${
                        check.status === "done"
                          ? "text-success"
                          : check.status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }`}
                    >
                      {check.status}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">
                      {check.started_at ? fmtTime(check.started_at) : "—"}
                      {check.finished_at
                        ? ` → ${fmtTime(check.finished_at)}`
                        : " → …"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
