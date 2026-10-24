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
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_changes", label: "Needs changes" },
  { key: "in_review", label: "In review" },
  { key: "approved", label: "Approved" },
] as const;

export function ItemsBrowser({
  items,
  kitLabel,
}: {
  items: ListItem[];
  kitLabel: string;
}) {
  const [filter, setFilter] = useState<string>("all");

  const shown = items.filter((i) => filter === "all" || i.status === filter);
  const count = (s: ContentStatus) => items.filter((i) => i.status === s).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3 text-[12.5px] text-muted-foreground">
          <span>
            <b className="font-semibold text-foreground">{items.length}</b> items
          </span>
          <span className="h-[3px] w-[3px] rounded-full bg-border" />
          <span>
            <b className="font-semibold text-foreground">{count("needs_changes")}</b> needs changes
          </span>
          <span className="h-[3px] w-[3px] rounded-full bg-border" />
          <span>
            <b className="font-semibold text-foreground">{count("in_review")}</b> in review
          </span>
          <span className="h-[3px] w-[3px] rounded-full bg-border" />
          <span>
            <b className="font-semibold text-foreground">{count("approved")}</b> approved
          </span>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-secondary p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {shown.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nothing here with that filter.
          </p>
        ) : (
          shown.map((item) => {
            const sev = (["high", "medium", "low"] as Severity[]).filter(
              (s) => (item.counts[s] ?? 0) > 0,
            );
            return (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-none hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring/40 lg:grid-cols-[minmax(0,1fr)_200px_100px_140px] lg:gap-4 lg:px-4.5"
              >
                <div className="min-w-0">
                  <span className="block text-[11px] text-muted-foreground">
                    {item.source_kind === "text" ? "Text" : "Image"} ·{" "}
                    {item.context_type.replace("_", " ")}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-semibold transition-colors group-hover:text-primary">
                    {item.snippet || "No text content"}
                  </span>
                </div>
                <div className="hidden flex-wrap gap-1.5 lg:flex">
                  {sev.length === 0 ? (
                    <span className="rounded-full border border-success-border bg-success-soft px-2 py-0.5 text-[10.5px] font-semibold text-success">
                      clean
                    </span>
                  ) : (
                    sev.map((s) => (
                      <SevChip key={s} severity={s} />
                    ))
                  )}
                </div>
                <span className="hidden text-xs text-muted-foreground lg:block">{kitLabel}</span>
                <span className="text-right">
                  <StatusPill status={item.status} />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
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
