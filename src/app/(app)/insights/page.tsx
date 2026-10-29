import { redirect } from "next/navigation";

import { NoWorkspaceNotice } from "@/components/no-workspace-notice";
import { createClient } from "@/lib/supabase/server";

/**
 * The insights view (Round 3, T2): the "head of brand" aggregate view of how
 * governance is actually running — violation mix, decision behaviour, and
 * throughput, computed server-side over RLS-scoped rows for this workspace.
 *
 * Aggregation happens in the server component rather than in SQL: at demo
 * scale (tens to hundreds of rows) one fetch per table is simpler and keeps
 * the query surface fully RLS-covered; at production scale this moves into
 * SQL views / an RPC without changing the page.
 */

type ItemRow = { id: string; status: string; created_at: string };
type FindingRow = { kit_rule_id: string | null; severity: string; status: string; created_at: string };
type DecisionRow = { action: string; content_item_id: string; created_at: string };
type CheckRow = { created_at: string; status: string };
type RuleRow = { id: string; name: string; rule_type: string };

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  uploaded: "uploaded",
  checking: "checking",
  needs_changes: "needs changes",
  in_review: "in review",
  approved: "approved",
  returned: "returned",
  failed: "failed",
};

const DECISION_LABELS: Record<string, string> = {
  approved: "approved",
  returned: "returned",
  fix_accepted: "fix accepted",
  fix_rejected: "fix rejected",
  override: "overrides",
};

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return <NoWorkspaceNotice />;

  const [{ data: items }, { data: findings }, { data: decisions }, { data: checks }, { data: rules }] =
    await Promise.all([
      supabase.from("content_items").select("id, status, created_at"),
      supabase.from("findings").select("kit_rule_id, severity, status, created_at"),
      supabase.from("decision_log").select("action, content_item_id, created_at"),
      supabase.from("checks").select("created_at, status"),
      supabase.from("kit_rules").select("id, name, rule_type"),
    ]);

  const itemRows = (items ?? []) as unknown as ItemRow[];
  const findingRows = (findings ?? []) as unknown as FindingRow[];
  const decisionRows = (decisions ?? []) as unknown as DecisionRow[];
  const checkRows = (checks ?? []) as unknown as CheckRow[];
  const ruleRows = (rules ?? []) as unknown as RuleRow[];

  const ruleName = new Map(ruleRows.map((r) => [r.id, r.name]));

  // ---- decision behaviour ----------------------------------------------------
  const decided = findingRows.filter((f) => f.status === "fix_accepted" || f.status === "fix_rejected");
  const accepted = findingRows.filter((f) => f.status === "fix_accepted").length;
  const overrides = findingRows.filter((f) => f.status === "overridden").length;
  const fixAcceptance = decided.length ? Math.round((accepted / decided.length) * 100) : null;
  const overrideRate = findingRows.length ? Math.round((overrides / findingRows.length) * 100) : null;

  // ---- time to approval --------------------------------------------------------
  const itemCreated = new Map(itemRows.map((i) => [i.id, new Date(i.created_at).getTime()]));
  const approvalHours = decisionRows
    .filter((d) => d.action === "approved")
    .map((d) => (itemCreated.get(d.content_item_id) ?? 0) && (new Date(d.created_at).getTime() - (itemCreated.get(d.content_item_id) ?? 0)) / 3_600_000)
    .filter((h) => h > 0);
  const avgApprovalHours = approvalHours.length
    ? (approvalHours.reduce((a, b) => a + b, 0) / approvalHours.length).toFixed(1)
    : null;

  // ---- findings by rule ---------------------------------------------------------
  const byRule = new Map<string, { count: number; severities: Record<string, number> }>();
  for (const f of findingRows) {
    const name = f.kit_rule_id ? (ruleName.get(f.kit_rule_id) ?? "Uncited / needs human") : "Uncited / needs human";
    const entry = byRule.get(name) ?? { count: 0, severities: {} };
    entry.count += 1;
    entry.severities[f.severity] = (entry.severities[f.severity] ?? 0) + 1;
    byRule.set(name, entry);
  }
  const ruleBars = [...byRule.entries()].sort((a, b) => b[1].count - a[1].count);
  const maxRuleCount = ruleBars[0]?.[1].count ?? 1;

  // ---- guideline health: most overridden / repeatedly flagged rules ----------
  const ruleHealth = new Map<string, { total: number; overridden: number; accepted: number }>();
  for (const f of findingRows) {
    if (!f.kit_rule_id) continue;
    const name = ruleName.get(f.kit_rule_id);
    if (!name) continue;
    const e = ruleHealth.get(name) ?? { total: 0, overridden: 0, accepted: 0 };
    e.total += 1;
    if (f.status === "overridden") e.overridden += 1;
    if (f.status === "fix_accepted") e.accepted += 1;
    ruleHealth.set(name, e);
  }
  const ruleHealthRows = [...ruleHealth.entries()]
    .map(([name, e]) => ({
      name,
      ...e,
      overrideRate: Math.round((e.overridden / e.total) * 100),
      unclear: e.total >= 2 && e.overridden / e.total >= 0.5,
    }))
    .sort((a, b) => b.overridden - a.overridden || b.total - a.total);

  // ---- checks per day (last 14 days) --------------------------------------------
  const days: { day: string; count: number }[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, count: 0 });
  }
  const dayIndex = new Map(days.map((d) => [d.day, d]));
  for (const c of checkRows) {
    const key = new Date(c.created_at).toISOString().slice(0, 10);
    const slot = dayIndex.get(key);
    if (slot) slot.count += 1;
  }
  const maxPerDay = Math.max(1, ...days.map((d) => d.count));

  const empty = checkRows.length === 0 && findingRows.length === 0 && decisionRows.length === 0;

  const fmtDay = (key: string) =>
    new Date(key + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

  return (
    <div className="mx-auto max-w-[1120px] space-y-5 pb-12">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">Insights</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          How brand governance is running in this workspace: violation mix, decision behaviour, and
          throughput. Computed live from RLS-scoped rows — nothing here leaves the workspace.
        </p>
      </div>

      {empty ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="font-semibold text-foreground">No activity yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Run a check on uploaded content and the violation mix, decision behaviour, and throughput
            charts will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Checks run" value={String(checkRows.length)} sub="all time" />
            <Metric label="Findings" value={String(findingRows.length)} sub="flagged by the kit" />
            <Metric label="Fix acceptance" value={fixAcceptance === null ? "—" : `${fixAcceptance}%`} sub="accepted ÷ decided" />
            <Metric label="Overrides" value={overrideRate === null ? "—" : `${overrideRate}%`} sub="of all findings" />
            <Metric label="Time to approve" value={avgApprovalHours === null ? "—" : `${avgApprovalHours}h`} sub="upload → approval" />
            <Metric label="Approved items" value={String(itemRows.filter((i) => i.status === "approved").length)} sub="all time" />
          </div>

          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <span className="text-[13px] font-semibold">Findings by rule</span>
              <span className="ml-2 text-[11px] text-muted-foreground">which rules the content actually breaks</span>
            </div>
            <div className="space-y-2.5 px-4 py-4">
              {ruleBars.map(([name, { count, severities }]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-52 shrink-0 truncate text-right text-[12px] text-muted-foreground" title={name}>
                    {name}
                  </span>
                  <div className="h-4 flex-1 overflow-hidden rounded-sm bg-secondary">
                    <div
                      className="flex h-full rounded-sm bg-sev-medium/70"
                      style={{ width: `${(count / maxRuleCount) * 100}%` }}
                    >
                      {(severities.high ?? 0) > 0 && (
                        <span className="h-full bg-sev-high/80" style={{ width: `${((severities.high ?? 0) / count) * 100}%` }} />
                      )}
                      {(severities.low ?? 0) > 0 && (
                        <span
                          className="ml-auto h-full bg-sev-low/80"
                          style={{ width: `${((severities.low ?? 0) / count) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                  <span className="w-8 text-[12px] font-medium tabular-nums text-foreground/85">{count}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <span className="text-[13px] font-semibold">Checks per day</span>
                <span className="ml-2 text-[11px] text-muted-foreground">last 14 days</span>
              </div>
              <div className="flex h-32 items-end gap-1.5 px-4 py-4">
                {days.map((d) => (
                  <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${fmtDay(d.day)}: ${d.count} check${d.count === 1 ? "" : "s"}`}>
                    <div
                      className="rounded-t-sm bg-primary/70 transition-all"
                      style={{ height: `${Math.max(3, (d.count / maxPerDay) * 100)}%` }}
                    />
                    <span className="mt-1.5 truncate text-center text-[9px] text-muted-foreground">{fmtDay(d.day).split(" ")[0]}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <span className="text-[13px] font-semibold">Decisions & statuses</span>
                <span className="ml-2 text-[11px] text-muted-foreground">the audit trail in numbers</span>
              </div>
              <div className="space-y-4 px-4 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Decision log</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {Object.entries(DECISION_LABELS).map(([action, label]) => {
                      const n = decisionRows.filter((d) => d.action === action).length;
                      return (
                        <span key={action} className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                          {n} {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Items by status</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {itemRows.length === 0 && <span className="text-[11px] text-muted-foreground">no items yet</span>}
                    {[...new Set(itemRows.map((i) => i.status))].map((s) => (
                      <span key={s} className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                        {itemRows.filter((i) => i.status === s).length} {STATUS_LABELS[s] ?? s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {ruleHealthRows.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Guideline health
          </h2>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Rules that people override often, or keep tripping over, may be unclear or too strict.
          </p>
          <div className="mt-3 space-y-2">
            {ruleHealthRows.map((r) => (
              <div key={r.name} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{r.name}</span>
                <span className="text-xs text-muted-foreground">
                  flagged {r.total}x · overridden {r.overridden} ({r.overrideRate}%) · fix accepted {r.accepted}
                </span>
                {r.unclear && (
                  <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    Possibly unclear
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="px-1 text-[11.5px] leading-relaxed text-muted-foreground">
        Scope: this workspace only, enforced by row-level security. Aggregation is computed server-side
        per request; at production scale it moves into SQL views without changing this page.
      </p>
    </div>
  );
}
