# Vcon — Acceptance & demo script (M1 draft)

**Definition of done (M9):** one post goes from upload to approval without
manual fixes, every flag explained and citing its rule, decisions recorded in
history — plus a backup screen recording of the same run.

Everything below uses the seeded **GlowNaturals Brand Kit v1**
(`supabase/seed.sql`) and the fictional skincare example from the Round 1
submission (§3.9). No real brand data.

## 1. Full-run script (the M9 acceptance run)

1. Sign in as **admin** → `/kit`: confirm the 8 seeded rules of GlowNaturals
   kit v1 are listed with types, names and severities.
2. Sign in as **creator** → `/upload`: choose context "Instagram post",
   submit the seeded caption + image (see matrix below), leave alt text empty.
3. Item shows **checking**, then **needs_changes**. Findings list shows, for
   each row: what, where, why, the rule it cites, confidence (AI findings),
   and a suggested fix.
4. Creator accepts the banned-term fix (ready-to-copy corrected wording) and
   rejects the tone suggestion (rejecting must be possible without breaking).
5. Creator applies accepted fixes, resubmits with alt text added and the
   approved claim phrasing. Resubmission is linked to the earlier item and
   re-checked against the **same kit version**.
6. Claim-related finding routed to **reviewer** (or approver) queue, not the
   creator's queue. Reviewer approves the claim with a comment.
7. Approver gives final **Approved**; decision history shows every action with
   actor + timestamp; kit version shown on the item.
8. Sign back in as **creator** — creator cannot approve (M8 gating check).

## 2. Seeded-error matrix (per checker)

Each row is one seeded error the demo content deliberately contains. M4/M6
"done when" = every row below produces its expected finding with the right
rule cited.

| # | Checker | Demo input (seeded error) | Expected finding | Cited rule |
|---|---|---|---|---|
| E1 | banned_term (deterministic) | Caption contains "miracle glow" | Banned term flagged, exact location given | Banned: "miracle" |
| E2 | approved_claim (AI) | Caption says "100% natural" | Claim not in approved library; suggested fix uses "made with natural ingredients"; routed to reviewer | Approved claims (C-12) |
| E3 | disclaimer (deterministic) | Caption says "clinically proven" with no "Results may vary" | Missing required disclaimer, fix offers the exact sentence | Disclaimer with performance claims |
| E4 | brand_color (deterministic) | Image hero colour far off palette (e.g. bright pink) | Colour off approved palette, nearest palette colour named | Approved palette |
| E5 | alt_text (deterministic) | Image uploaded with empty alt text | Alt text missing | Alt text required |
| E6 | tone (AI) | Caption uses hype + ALL CAPS ("AMAZING RESULTS!!!") | Tone off-voice, confidence shown, low confidence → needs human | Voice: warm, plain-spoken |
| E7 | terminology (AI) | Brand written "Glow Naturals" | Terminology: use "GlowNaturals" | Terminology: brand name |

**Negative controls (must NOT flag):** clean caption "Made with natural
ingredients, patch test recommended. Results may vary." with on-palette image
and correct brand name → zero findings.

## 3. Measures to record during the run (feeds §8.5 / Round 3)

- Share of seeded errors detected: __/7
- False flags on the negative control: __
- Findings citing the correct rule: __/N
- Time per check (upload → findings visible): __ s

## 4. Edge cases to show once in the demo

- AI unsure / no source → finding marked **needs human**, never guessed.
- Kit updated between submissions → item records the kit version it was
  checked against.
- Malformed AI output → one retry, then needs human (M6 validator log).

## 5. Run log — 24 Oct 2026 (M9 acceptance, local stack, real API surfaces)

**Full seeded-error matrix: 7/7 detected, 0 false flags, every finding cited.**

| Seeded error | Checker | Detected | Cited rule |
|---|---|---|---|
| E1 banned "miracle" | deterministic | ✅ | Banned: "miracle" |
| E2 "100% natural" claim | AI (Gemini 3.5 Flash) | ✅ | Approved claims (C-12), routed to reviewer |
| E3 missing disclaimer | deterministic | ✅ | Disclaimer with performance claims |
| E4 off-palette image | deterministic | ✅ | Approved palette (ΔE 122.7 vs limit 10) |
| E5 missing alt text | deterministic | ✅ | Alt text required |
| E6 hype tone | AI | ✅ | Voice: warm, plain-spoken |
| E7 "Glow Naturals" | AI | ✅ | Terminology: brand name |

- False flags: **0** (clean caption + on-palette sage image with alt text → 0 findings)
- Citations correct: **all**; uncited findings: **0**
- Time per check: deterministic ≈ 8–25 ms; with AI ≈ 0.8–4.5 s (model 3.5-flash, thinking off)
- Full flow exercised via real surfaces: upload (RLS-scoped insert + private
  storage) → checks → 6 findings on the flagged post+image → creator
  accept/reject decisions (both exercised) → reviewer approved the claim via
  override with reason → creator resubmitted (new linked item, re-checked:
  0 findings) → approver approved → **text post: upload → approval with no
  manual fixes**; on-palette image also approved.
- Gating: creator attempting approve → refused (303), no decision row.
- Harness notes (not product bugs): verification drove server actions via
  no-JS form encodings; a lexicographic action-id pick swapped two decision
  calls, and the append-only design correctly refused to rewrite them —
  decisions are immutable once made.
- Product fix that came out of the rehearsal: mixed findings (creator +
  reviewer) now leave the item at `needs_changes` while creator work is
  open, instead of jumping to `in_review` and blocking the fix loop.
