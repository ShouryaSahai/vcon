import { redirect } from "next/navigation";

import { NoWorkspaceNotice } from "@/components/no-workspace-notice";
import { createClient } from "@/lib/supabase/server";

import results from "@/lib/evals/results.json";

/**
 * The measured-evaluation scorecard (Round 3). Renders the committed
 * results.json produced by `pnpm test:evals` — a labeled set run through the
 * REAL production checkers, per family in isolation, with exact attribution.
 * Rerunning the suite refreshes the file; nothing here is hand-written.
 */

type CaseRow = {
  id: string;
  family: "deterministic" | "ai";
  title: string;
  notes?: string;
  ok: boolean;
  expected: string[];
  flagged: string[];
  missing: string[];
  extras: string[];
  latencyMs: number;
  degraded?: boolean;
};

const r = results as {
  meta: { when: string; model: string; aiEnabled: boolean; cases: number };
  totals: {
    pass: number;
    fail: number;
    detectionRate: number;
    falseFlagRate: number;
    citationRate: number;
    avgLatencyMs: { deterministic: number; ai: number };
  };
  cases: CaseRow[];
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function EvalsPage() {
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

  const t = r.totals;
  const aiLatency = t.avgLatencyMs.ai > 0 ? `${(t.avgLatencyMs.ai / 1000).toFixed(1)}s` : "—";

  return (
    <div className="mx-auto max-w-[1120px] space-y-5 pb-12">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">Evaluation scorecard</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          A labeled eval set run through the real production checkers — not a
          demo claim. Each case carries the exact rule set it must flag; cases
          run per checker family in isolation, so a false flag is a real false
          flag.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Cases" value={`${t.pass}/${r.meta.cases}`} sub="passing" />
        <Metric label="Detection" value={pct(t.detectionRate)} sub="expected rules flagged" />
        <Metric label="False flags" value={pct(t.falseFlagRate)} sub="clean cases flagged" />
        <Metric label="Citations" value={pct(t.citationRate)} sub="findings citing a kit rule" />
        <Metric label="Deterministic" value={`${t.avgLatencyMs.deterministic}ms`} sub="avg per case" />
        <Metric label="AI" value={aiLatency} sub={r.meta.aiEnabled ? "avg per case" : "pending model quota"} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <span>
          Model: <strong className="text-foreground/85">{r.meta.model}</strong>
        </span>
        <span>Recorded: {new Date(r.meta.when).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
        <span>
          Rerun: <code className="rounded bg-secondary px-1.5 py-0.5">pnpm test:evals</code> (asserts every case
          and rewrites these numbers)
        </span>
        {!r.meta.aiEnabled && (
          <span className="text-warning">
            AI family not in this recording (model quota window) — deterministic family is fully recorded.
          </span>
        )}
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <span className="text-[13px] font-semibold">Case results</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Case</th>
                <th className="px-3 py-2 font-semibold">Family</th>
                <th className="px-3 py-2 font-semibold">Expected</th>
                <th className="px-3 py-2 font-semibold">Flagged</th>
                <th className="px-4 py-2 text-right font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {r.cases.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-none">
                  <td className="px-4 py-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{c.id}</span>{" "}
                    <span className="font-medium">{c.title}</span>
                    {c.notes && <span className="block text-[11px] text-muted-foreground">{c.notes}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
                        c.family === "ai"
                          ? "border-primary/25 bg-primary/5 text-primary"
                          : "border-border bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {c.family === "ai" ? "AI" : "deterministic"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.expected.length === 0 ? <em>clean</em> : c.expected.join(", ")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.flagged.length === 0 ? <em>none</em> : c.flagged.join(", ")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {c.ok ? (
                      <span className="rounded-full border border-success-border bg-success-soft px-2 py-0.5 text-[10.5px] font-semibold text-success">
                        pass
                      </span>
                    ) : (
                      <span className="rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[10.5px] font-semibold text-destructive">
                        fail
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="px-1 text-[11.5px] leading-relaxed text-muted-foreground">
        Methodology: the fixtures mirror <code className="rounded bg-secondary px-1">supabase/seed.sql</code>{" "}
        (GlowNaturals kit v1) exactly; the harness runs the same checker functions the pipeline uses
        (<code className="rounded bg-secondary px-1">src/lib/checks</code>) in-memory — no database, no
        storage, no rate limits. An honest AI failure (rate limit, unusable output) degrades to a
        needs-human finding and fails the case rather than guessing. See{" "}
        <code className="rounded bg-secondary px-1">docs/evals.md</code> and{" "}
        <code className="rounded bg-secondary px-1">src/lib/evals</code>.
      </p>
    </div>
  );
}
