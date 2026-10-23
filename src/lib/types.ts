export const USER_ROLES = ["admin", "creator", "approver", "reviewer"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  creator: "Creator",
  approver: "Approver",
  reviewer: "Specialist reviewer",
};

export interface Profile {
  id: string;
  workspace_id: string | null;
  full_name: string;
  role: UserRole;
  created_at: string;
}
