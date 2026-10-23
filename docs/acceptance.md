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
