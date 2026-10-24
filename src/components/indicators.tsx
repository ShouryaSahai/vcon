import type { ContentStatus } from "@/lib/db-types";

const STATUS_STYLES: Record<ContentStatus, { cls: string; label: string }> = {
  uploaded: { cls: "bg-secondary text-secondary-foreground border-border", label: "uploaded" },
  checking: { cls: "bg-secondary text-secondary-foreground border-border", label: "checking" },
  needs_changes: {
    cls: "bg-sev-high-soft text-sev-high border-sev-high-border",
    label: "needs changes",
  },
  in_review: {
    cls: "bg-primary/10 text-primary border-primary/25",
    label: "in review",
  },
  approved: { cls: "bg-success-soft text-success border-success-border", label: "approved" },
  returned: {
    cls: "bg-warning-soft text-warning border-warning-border",
    label: "returned",
  },
  failed: { cls: "bg-destructive/10 text-destructive border-destructive/25", label: "failed" },
};

export function StatusPill({ status }: { status: ContentStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

export type Severity = "low" | "medium" | "high";

const SEV_STYLES: Record<Severity, { cls: string; label: string }> = {
  high: { cls: "bg-sev-high-soft text-sev-high border-sev-high-border", label: "high" },
  medium: { cls: "bg-sev-medium-soft text-sev-medium border-sev-medium-border", label: "medium" },
  low: { cls: "bg-sev-low-soft text-sev-low border-sev-low-border", label: "low" },
};

export function SevChip({ severity }: { severity: string }) {
  const s = SEV_STYLES[(severity as Severity) in SEV_STYLES ? (severity as Severity) : "medium"];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

/** Severity-colored left rail for evidence cards. */
export function SevRail({ severity, children }: { severity: string; children: React.ReactNode }) {
  const border =
    severity === "high"
      ? "border-l-sev-high"
      : severity === "low"
        ? "border-l-sev-low"
        : "border-l-sev-medium";
  return <div className={`rounded-r-lg border border-border border-l-[3px] ${border}`}>{children}</div>;
}

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      Confidence
      <span className="inline-block h-1 w-11 overflow-hidden rounded-full bg-border">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-medium text-foreground">{value.toFixed(2)}</span>
    </span>
  );
}

/** Highlights flagged terms inside a caption with per-finding severity. */
export function HighlightedText({
  text,
  ranges,
}: {
  text: string;
  ranges: { start: number; end: number; severity: string }[];
}) {
  const MARK: Record<string, string> = {
    high: "bg-sev-high-soft text-sev-high decoration-sev-high",
    medium: "bg-sev-medium-soft text-sev-medium decoration-sev-medium",
    low: "bg-sev-low-soft text-sev-low decoration-sev-low",
  };
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number; severity: string }[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  const out: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach((r, i) => {
    if (r.start > cursor) out.push(<span key={`t${i}`}>{text.slice(cursor, r.start)}</span>);
    out.push(
      <mark
        key={`m${i}`}
        className={`rounded-sm border-b-[1.5px] bg-transparent px-0.5 ${MARK[r.severity] ?? MARK.high}`}
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) out.push(<span key="tail">{text.slice(cursor)}</span>);
  return <>{out}</>;
}
