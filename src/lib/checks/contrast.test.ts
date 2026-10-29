import { describe, expect, it } from "vitest";

import {
  contrastLevel,
  contrastRatio,
  paletteContrastReport,
} from "./contrast";

describe("contrast", () => {
  it("black on white is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("same colour is 1:1", () => {
    expect(contrastRatio("#7C9A6D", "#7C9A6D")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#7C9A6D", "#F5F1E8")).toBeCloseTo(
      contrastRatio("#F5F1E8", "#7C9A6D") as number,
      8,
    );
  });

  it("#767676 on white passes AA, #777777 does not", () => {
    const pass = contrastRatio("#767676", "#ffffff") as number;
    const fail = contrastRatio("#777777", "#ffffff") as number;
    expect(contrastLevel(pass)).toBe("AA");
    expect(contrastLevel(fail)).toBe("AA-large");
  });

  it("returns null for invalid hex", () => {
    expect(contrastRatio("nope", "#ffffff")).toBeNull();
  });

  it("builds a sorted report for a palette", () => {
    const report = paletteContrastReport([
      { name: "Ink", hex: "#000000" },
      { name: "Linen", hex: "#F5F1E8" },
      { name: "Honey", hex: "#E8B04B" },
    ]);
    expect(report).toHaveLength(3);
    expect(report[0].ratio).toBeGreaterThanOrEqual(report[1].ratio);
  });
});
