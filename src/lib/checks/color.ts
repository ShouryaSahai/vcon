import type { FindingSeed, } from "@/lib/checks/deterministic";
import type { KitRule } from "@/lib/db-types";

// ===== Colour math (sRGB → Lab, CIE76 ΔE) ===================================

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function srgbChannelToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** sRGB (0-255) → CIE Lab. */
export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  // sRGB → XYZ (D65)
  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;

  // XYZ → Lab (D65 reference white)
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE — simple, deterministic. Superseded by CIEDE2000 for palette
 *  matching (kept for continuity + the eval record of the upgrade). */
export function deltaE76(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

export function deltaEHex(hexA: string, hexB: string): number {
  const ca = hexToRgb(hexA);
  const cb = hexToRgb(hexB);
  return deltaE76(srgbToLab(ca.r, ca.g, ca.b), srgbToLab(cb.r, cb.g, cb.b));
}

/**
 * CIEDE2000 ΔE (Sharma, Wu & Dalal 2005) — the perceptually-uniform upgrade
 * over CIE76. CIE76 mis-picks "nearest" palette colours for saturated hues
 * (magenta measured closest to near-white Linen); CIEDE2000's chroma/hue
 * weighting fixes that. Reference-validated against the published test
 * dataset in color.test.ts.
 */
export function deltaE2000(
  [L1, a1, b1]: [number, number, number],
  [L2, a2, b2]: [number, number, number],
): number {
  const rad = Math.PI / 180;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);
  const h1p = C1p === 0 ? 0 : (Math.atan2(b1, a1p) / rad + 360) % 360;
  const h2p = C2p === 0 ? 0 : (Math.atan2(b2, a2p) / rad + 360) % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);

  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp: number;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
  else hbp = (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * rad) +
    0.24 * Math.cos(2 * hbp * rad) +
    0.32 * Math.cos((3 * hbp + 6) * rad) -
    0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Cbp7 = Cbp ** 7;
  const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;

  const tL = dLp / SL;
  const tC = dCp / SC;
  const tH = dHp / SH;
  return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
}

export function deltaE2000Hex(hexA: string, hexB: string): number {
  const ca = hexToRgb(hexA);
  const cb = hexToRgb(hexB);
  return deltaE2000(srgbToLab(ca.r, ca.g, ca.b), srgbToLab(cb.r, cb.g, cb.b));
}

// ===== Dominant colour of a decoded image ===================================

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, row-major. */
  data: Uint8Array;
}

/**
 * Coarse quantisation (4 bits/channel) + mode bucket, then the average of
 * that bucket. Deterministic and cheap — right for a demo checker.
 */
export function dominantColor(image: RasterImage): { hex: string; samples: number } | null {
  const { width, height, data } = image;
  const total = width * height;
  if (total === 0) return null;

  const step = Math.max(1, Math.floor(Math.sqrt(total / 10000)));
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < 200) continue; // ignore transparent pixels
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n += 1;
      buckets.set(key, bucket);
    }
  }

  let best: { r: number; g: number; b: number; n: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.n > best.n) best = bucket;
  }
  if (!best || best.n === 0) return null; // fully transparent image
  return {
    hex: rgbToHex(best.r / best.n, best.g / best.n, best.b / best.n),
    samples: best.n,
  };
}

// ===== E4: brand_color =======================================================

export function checkBrandColor(rule: KitRule, image: RasterImage): FindingSeed[] {
  const { colors, max_delta_e } = rule.payload as {
    colors?: { name: string; hex: string }[];
    max_delta_e?: number;
  };
  if (!colors || colors.length === 0) return [];
  const dominant = dominantColor(image);
  if (!dominant) return []; // nothing assessable (e.g. fully transparent)

  const dominantRgb = hexToRgb(dominant.hex);
  const dominantLab = srgbToLab(dominantRgb.r, dominantRgb.g, dominantRgb.b);

  let nearest: { name: string; hex: string; delta_e: number } | null = null;
  for (const c of colors) {
    const rgb = hexToRgb(c.hex);
    const d = deltaE2000(dominantLab, srgbToLab(rgb.r, rgb.g, rgb.b));
    if (!nearest || d < nearest.delta_e) nearest = { name: c.name, hex: c.hex, delta_e: d };
  }
  if (!nearest) return [];

  const limit = typeof max_delta_e === "number" ? max_delta_e : 10;
  if (nearest.delta_e <= limit) return [];

  return [
    {
      kit_rule_id: rule.id,
      source: "rule_engine",
      title: "Image colours off the approved palette",
      explanation:
        `The dominant colour is ${dominant.hex}; the closest approved colour is ` +
        `“${nearest.name}” (${nearest.hex}) at ΔE ${nearest.delta_e.toFixed(1)}, ` +
        `but rule “${rule.name}” allows up to ΔE ${limit}.`,
      severity: rule.severity_default,
      location: {
        type: "image_palette",
        dominant: dominant.hex,
        nearest: { name: nearest.name, hex: nearest.hex, delta_e: Number(nearest.delta_e.toFixed(1)) },
        limit,
      },
      suggested_fix:
        `Match the visual to “${nearest.name}” (${nearest.hex}) or another approved colour.`,
      confidence: null,
      assigned_to_role: "creator",
      needs_human: false,
      status: "open",
    },
  ];
}
