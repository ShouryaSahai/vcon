import { Badge } from "@/components/ui/badge";
import { paletteContrastReport, type PaletteColor } from "@/lib/checks/contrast";
import type { KitRule } from "@/lib/db-types";

const LEVEL_LABEL = {
  AAA: "Readable text (AAA)",
  AA: "Readable text (AA)",
  "AA-large": "Large text only",
  fail: "Not readable",
} as const;

export function PaletteContrast({ rules }: { rules: KitRule[] }) {
  const colors: PaletteColor[] = [];
  for (const rule of rules) {
    if (rule.rule_type !== "brand_color" || !rule.is_active) continue;
    const payload = (rule.payload ?? {}) as { colors?: PaletteColor[] };
    for (const c of payload.colors ?? []) {
      if (!c?.hex) continue;
      const seen = colors.some((x) => x.hex.toLowerCase() === c.hex.toLowerCase());
      if (!seen) colors.push(c);
    }
  }
  if (colors.length < 2) return null;

  const report = paletteContrastReport(colors);

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground/85">
        Palette accessibility (text contrast)
      </h2>
      <p className="text-sm text-muted-foreground">
        WCAG contrast for every pair of approved colours. Use only readable pairs
        for text on a background.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {report.map((p) => (
          <div
            key={`${p.a.hex}-${p.b.hex}`}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
          >
            <div
              className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border border-border text-sm font-semibold"
              style={{ backgroundColor: p.a.hex, color: p.b.hex }}
              aria-hidden="true"
            >
              Aa
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {p.b.name} on {p.a.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {p.ratio.toFixed(2)}:1
              </div>
            </div>
            <Badge variant={p.level === "fail" ? "destructive" : "secondary"}>
              {LEVEL_LABEL[p.level]}
            </Badge>
          </div>
        ))}
      </div>
    </section>
  );
}
