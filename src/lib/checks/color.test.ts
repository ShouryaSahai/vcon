import { describe, expect, it } from "vitest";

import {
  deltaE76,
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
