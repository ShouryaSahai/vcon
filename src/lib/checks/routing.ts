import type { AssignedRole } from "@/lib/db-types";

export interface Routing {
  assigned_to_role: AssignedRole;
  needs_human: boolean;
}

/**
 * Routes a finding by type and confidence (Round 1 §4.1):
 *  - claims and facts (approved_claim) go to the reviewer, never auto-fixed;
 *  - low-confidence AI findings go to human review instead of being asserted;
 *  - everything else is a creator fix.
 */
export function routeFinding(ruleType: string, confidence: number | null): Routing {
  if (ruleType === "approved_claim") {
    return { assigned_to_role: "reviewer", needs_human: false };
  }
  if (confidence !== null && confidence < 0.6) {
    return { assigned_to_role: "reviewer", needs_human: true };
  }
  return { assigned_to_role: "creator", needs_human: false };
}
