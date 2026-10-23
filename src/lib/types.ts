import type { RuleType } from "@/lib/db-types";

export const USER_ROLES = ["admin", "creator", "approver", "reviewer"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  creator: "Creator",
  approver: "Approver",
  reviewer: "Specialist reviewer",
};

export const RULE_TYPES: RuleType[] = [
  "banned_term",
  "required_term",
  "approved_claim",
  "brand_color",
  "tone_guideline",
  "disclaimer",
  "alt_text_policy",
  "custom",
];

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  banned_term: "Banned term",
  required_term: "Required term",
  approved_claim: "Approved claim",
  brand_color: "Brand colour",
  tone_guideline: "Tone guideline",
  disclaimer: "Disclaimer",
  alt_text_policy: "Alt text policy",
  custom: "Custom",
};

export const SEVERITIES = ["low", "medium", "high"] as const;

export interface Profile {
  id: string;
  workspace_id: string | null;
  full_name: string;
  role: UserRole;
  created_at: string;
}
