/** WCAG 2.x contrast helpers. Pure functions, no dependencies. */

function hexToRgb(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastLevel = "AAA" | "AA" | "AA-large" | "fail";

export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-large";
  return "fail";
}
export type PaletteColor = { name: string; hex: string };

export type ContrastPair = {
  a: PaletteColor;
  b: PaletteColor;
  ratio: number;
  level: ContrastLevel;
};

/** Contrast ratio for every pair of colours in a brand palette, best first. */
export function paletteContrastReport(colors: PaletteColor[]): ContrastPair[] {
  const out: ContrastPair[] = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const ratio = contrastRatio(colors[i].hex, colors[j].hex);
      if (ratio === null) continue;
      const rounded = Math.round(ratio * 100) / 100;
      out.push({
        a: colors[i],
        b: colors[j],
        ratio: rounded,
        level: contrastLevel(rounded),
      });
    }
  }
  return out.sort((x, y) => y.ratio - x.ratio);
}

/** Pairs that are safe for normal body text (WCAG AA or better). */
export function readablePairs(report: ContrastPair[]): ContrastPair[] {
  return report.filter((p) => p.level === "AA" || p.level === "AAA");
}