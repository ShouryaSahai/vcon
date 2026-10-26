import { describe, expect, it } from "vitest";

import {
  deltaE76,
  deltaE2000,
  deltaEHex,
  dominantColor,
  hexToRgb,
  rgbToHex,
  srgbToLab,
  checkBrandColor,
  type RasterImage,
} from "./color";
import type { KitRule } from "@/lib/db-types";

function solidImage(r: number, g: number, b: number, size = 8): RasterImage {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width: size, height: size, data };
}

const paletteRule = (max = 10) =>
  ({
    id: "rule-color",
    kit_version_id: "ver-1",
    rule_type: "brand_color",
    name: "Approved palette",
    payload: {
      colors: [
        { name: "Sage", hex: "#7C9A6D" },
        { name: "Honey", hex: "#E8B04B" },
        { name: "Linen", hex: "#F5F1E8" },
      ],
      max_delta_e: max,
    },
    severity_default: "low",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  }) as KitRule;

describe("colour math", () => {
  it("round-trips hex", () => {
    expect(rgbToHex(hexToRgb("#7C9A6D").r, hexToRgb("#7C9A6D").g, hexToRgb("#7C9A6D").b)).toBe(
      "#7c9a6d",
    );
  });

  it("gives ΔE 0 for identical colours", () => {
    const lab = srgbToLab(124, 154, 109);
    expect(deltaE76(lab, lab)).toBe(0);
  });

  it("gives known-order ΔE for distinct colours", () => {
    const near = deltaEHex("#7C9A6D", "#7F9E70"); // sage vs slightly-off sage
    const far = deltaEHex("#7C9A6D", "#FF00FF"); // sage vs magenta
    expect(near).toBeLessThan(5);
    expect(far).toBeGreaterThan(40);
    expect(far).toBeGreaterThan(near);
  });

  it("converts sRGB white to Lab ~100", () => {
    const [L] = srgbToLab(255, 255, 255);
    expect(L).toBeCloseTo(100, 1);
  });
});

describe("CIEDE2000", () => {
  // Reference pairs from the published Sharma, Wu & Dalal (2005) test dataset.
  it("matches the published reference values", () => {
    const ref: [[number, number, number], [number, number, number], number][] = [
      [[50.0, 2.6772, -79.7751], [50.0, 0.0, -82.7485], 2.0425],
      [[50.0, 3.1571, -77.2803], [50.0, 0.0, -82.7485], 2.8615],
      [[50.0, 2.8361, -74.02], [50.0, 0.0, -82.7485], 3.4412],
      [[50.0, -1.3802, -84.2814], [50.0, 0.0, -82.7485], 1.0],
      [[50.0, 2.5, 0.0], [50.0, 3.1736, 0.5854], 1.0],
      [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    ];
    for (const [a, b, expected] of ref) {
      expect(deltaE2000(a, b)).toBeCloseTo(expected, 4);
    }
  });

  it("gives ΔE 0 for identical colours", () => {
    const lab = srgbToLab(124, 154, 109);
    expect(deltaE2000(lab, lab)).toBe(0);
  });

  it("fixes the CIE76 saturated-hue mis-pick for nearest palette colour", () => {
    // Royal blue: CIE76 measures near-white Linen as "closest" (absurd);
    // CIEDE2000's chroma/hue weighting picks Sage instead.
    const blue = srgbToLab(65, 105, 225);
    const sage = srgbToLab(124, 154, 109);
    const honey = srgbToLab(232, 176, 75);
    const linen = srgbToLab(245, 241, 232);
    const nearest76 = [
      { name: "Sage", d: deltaE76(blue, sage) },
      { name: "Honey", d: deltaE76(blue, honey) },
      { name: "Linen", d: deltaE76(blue, linen) },
    ].sort((x, y) => x.d - y.d)[0];
    const nearest2000 = [
      { name: "Sage", d: deltaE2000(blue, sage) },
      { name: "Honey", d: deltaE2000(blue, honey) },
      { name: "Linen", d: deltaE2000(blue, linen) },
    ].sort((x, y) => x.d - y.d)[0];
    expect(nearest76.name).toBe("Linen"); // the old flaw
    expect(nearest2000.name).toBe("Sage"); // the fix
  });
});

describe("dominantColor", () => {
  it("finds the solid colour", () => {
    const dom = dominantColor(solidImage(124, 154, 109));
    expect(dom).not.toBeNull();
    expect(dom!.hex.toLowerCase()).toBe("#7c9a6d");
  });

  it("ignores transparent pixels entirely", () => {
    const img = solidImage(255, 0, 255);
    for (let i = 0; i < img.width * img.height; i++) img.data[i * 4 + 3] = 0;
    expect(dominantColor(img)).toBeNull();
  });
});

describe("checkBrandColor (E4)", () => {
  it("flags off-palette dominant colour with ΔE in the explanation", () => {
    const findings = checkBrandColor(paletteRule(), solidImage(255, 0, 255));
    expect(findings).toHaveLength(1);
    expect(findings[0].kit_rule_id).toBe("rule-color");
    expect(findings[0].explanation).toContain("ΔE");
    // the fix must point at one of the approved palette colours
    expect(findings[0].suggested_fix).toMatch(/Sage|Honey|Linen/);
  });

  it("passes for on-palette colour (negative control)", () => {
    expect(checkBrandColor(paletteRule(), solidImage(124, 154, 109))).toHaveLength(0);
  });

  it("respects the rule's max ΔE", () => {
    // slightly-off sage: passes with a generous limit, fails with a tight one
    const img = solidImage(130, 160, 115);
    expect(checkBrandColor(paletteRule(40), img)).toHaveLength(0);
    expect(checkBrandColor(paletteRule(1), img)).toHaveLength(1);
  });
});
