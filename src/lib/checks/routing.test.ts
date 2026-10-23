import { describe, expect, it } from "vitest";

import { routeFinding } from "./routing";

describe("routeFinding", () => {
  it("routes claims to the reviewer (M8 done-when)", () => {
    expect(routeFinding("approved_claim", 0.95)).toEqual({
      assigned_to_role: "reviewer",
      needs_human: false,
    });
  });

  it("sends low-confidence findings to human review", () => {
    expect(routeFinding("tone_guideline", 0.4)).toEqual({
      assigned_to_role: "reviewer",
      needs_human: true,
    });
    expect(routeFinding("banned_term", 0.59)).toEqual({
      assigned_to_role: "reviewer",
      needs_human: true,
    });
  });

  it("keeps confident mechanical findings with the creator", () => {
    expect(routeFinding("banned_term", null)).toEqual({
      assigned_to_role: "creator",
      needs_human: false,
    });
    expect(routeFinding("tone_guideline", 0.9)).toEqual({
      assigned_to_role: "creator",
      needs_human: false,
    });
  });
});
