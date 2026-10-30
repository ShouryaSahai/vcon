"use client";

import Link from "next/link";
import { useState } from "react";

import { SevChip, StatusPill } from "@/components/indicators";
import { fmtDateTime } from "@/lib/format";
import type { ContentStatus, Severity } from "@/lib/db-types";

export interface ListItem {
  id: string;
  source_kind: "text" | "image" | "docx";
  context_type: string;
  status: ContentStatus;
  created_at: string;
  snippet: string;
  flagged: boolean;
  counts: Record<Severity, number>;
  wordCount?: number;
  charCount?: number;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_changes", label: "Needs changes" },
  { key: "in_review", label: "In review" },
  { key: "approved", label: "Approved" },
] as const;

const KIND_FILTERS = [
  { key: "all", label: "ALL SOURCES" },
  { key: "text", label: "TEXT" },
  { key: "docx", label: "PDF / DOC" },
  { key: "image", label: "IMAGE" },
] as const;

function sourceBadge(kind: ListItem["source_kind"]) {
  if (kind === "docx") {
    return {
      label: "PDF / DOC",
      cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (kind === "image") {
    return {
      label: "IMAGE",
      cls: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    };
  }
  return {
    label: "TEXT",
    cls: "border-primary/30 bg-primary/10 text-primary",
  };
}

export function ItemsBrowser({
  items,
  kitLabel,
}: {
  items: ListItem[];
  kitLabel: string;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");

  const count = (s: ContentStatus) => items.filter((i) => i.status === s).length;
  const totalOpenFindings = items.reduce(
    (acc, i) => acc + (i.counts.high ?? 0) + (i.counts.medium ?? 0) + (i.counts.low ?? 0),
    0,
  );
  const highFindings = items.reduce((acc, i) => acc + (i.counts.high ?? 0), 0);
  const cleanItems = items.filter(
    (i) => (i.counts.high ?? 0) + (i.counts.medium ?? 0) + (i.counts.low ?? 0) === 0,
  ).length;
  const passRate = items.length > 0 ? Math.round((cleanItems / items.length) * 100) : 100;

  const shown = items.filter((i) => {
    if (filter !== "all" && i.status !== filter) return false;
    if (kindFilter !== "all" && i.source_kind !== kindFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return (
        i.snippet.toLowerCase().includes(q) ||
        i.context_type.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* PostHog-style 4-card KPI telemetry strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card px-3.5 py-2.5">
          <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            Total Checked
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-xl font-semibold text-foreground">{items.length}</span>
            <span className="font-mono text-[10.5px] text-muted-foreground">{kitLabel}</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card px-3.5 py-2.5">
          <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            Clean Pass Rate
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-xl font-semibold text-foreground">{passRate}%</span>
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {cleanItems}/{items.length} clean
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card px-3.5 py-2.5">
          <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            Open Findings
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-xl font-semibold text-foreground">
              {totalOpenFindings}
            </span>
            <span className="font-mono text-[10.5px] text-destructive">
              {highFindings} high-sev
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card px-3.5 py-2.5">
          <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            Queue Breakdown
          </span>
          <div className="mt-1 flex items-baseline justify-between font-mono text-[11px]">
            <span className="text-foreground">
              <b>{count("needs_changes")}</b> Flagged
            </span>
            <span className="text-muted-foreground">
              <b>{count("in_review")}</b> Review · <b>{count("approved")}</b> OK
            </span>
          </div>
        </div>
      </div>

      {/* Filter & search control bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by snippet, context, or #id…"
            className="h-8 w-56 rounded-md border border-border bg-card px-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <div className="inline-flex rounded-md border border-border bg-secondary p-0.5 font-mono">
            {KIND_FILTERS.map((kf) => (
              <button
                key={kf.key}
                type="button"
                onClick={() => setKindFilter(kf.key)}
                className={`rounded px-2 py-1 text-[10.5px] font-semibold transition-colors ${
                  kindFilter === kf.key
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {kf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="inline-flex rounded-lg border border-border bg-secondary p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* PostHog-style high-density data table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_210px_110px_150px] items-center gap-4 border-b border-border bg-secondary/50 px-4.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:grid">
          <span>Item / Telemetry</span>
          <span>Open Findings</span>
          <span>Kit Version</span>
          <span className="text-right">Status / Timestamp</span>
        </div>

        {shown.length === 0 ? (
          <p className="px-5 py-8 text-center font-mono text-xs text-muted-foreground">
            No matching items for the current filter.
          </p>
        ) : (
          shown.map((item) => {
            const sev = (["high", "medium", "low"] as Severity[]).filter(
              (s) => (item.counts[s] ?? 0) > 0,
            );
            const badge = sourceBadge(item.source_kind);
            const totalItemFindings =
              (item.counts.high ?? 0) + (item.counts.medium ?? 0) + (item.counts.low ?? 0);

            return (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-2.5 transition-colors last:border-none hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring/40 lg:grid-cols-[minmax(0,1fr)_210px_110px_150px] lg:gap-4 lg:px-4.5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.2 text-foreground/80">
                      #{item.id.slice(0, 6)}
                    </span>
                    <span className={`rounded border px-1.5 py-0.2 text-[10px] font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="uppercase tracking-wider">
                      {item.context_type.replace(/_/g, " ")}
                    </span>
                    {item.wordCount ? (
                      <span className="text-muted-foreground/80">
                        · {item.wordCount}w ({item.charCount} chars)
                      </span>
                    ) : null}
                  </div>
                  <span className="mt-1 block truncate text-[13px] font-semibold transition-colors group-hover:text-primary">
                    {item.snippet || "No text content"}
                  </span>
                </div>

                <div className="hidden flex-wrap items-center gap-1.5 lg:flex">
                  {sev.length === 0 ? (
                    <span className="rounded border border-success-border bg-success-soft px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-success">
                      0 findings · pass
                    </span>
                  ) : (
                    <>
                      {sev.map((s) => (
                        <SevChip key={s} severity={s} />
                      ))}
                      <span className="font-mono text-[10.5px] text-muted-foreground">
                        ({totalItemFindings})
                      </span>
                    </>
                  )}
                </div>

                <span className="hidden font-mono text-xs text-muted-foreground lg:block">
                  {kitLabel}
                </span>

                <span className="text-right">
                  <StatusPill status={item.status} />
                  <span className="mt-1 block font-mono text-[10.5px] text-muted-foreground">
                    {fmtDateTime(item.created_at)}
                  </span>
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
