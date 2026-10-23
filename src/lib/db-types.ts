// Hand-mapped database types for supabase-js, mirroring
// supabase/migrations/0001_init.sql 1:1.
//
// Once the Supabase CLI is linked to the project, regenerate with:
//   pnpm supabase gen types typescript --project-id <ref> > src/lib/db-types.ts
// and diff against this file.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ===== Enums (match the migration's CREATE TYPE statements) =================

export type UserRole = "admin" | "creator" | "approver" | "reviewer";
export type KitVersionStatus = "draft" | "published";
export type RuleType =
  | "banned_term"
  | "required_term"
  | "approved_claim"
  | "brand_color"
  | "tone_guideline"
  | "disclaimer"
  | "alt_text_policy"
  | "custom";
export type SourceKind = "text" | "image" | "docx";
export type ContextType = "instagram_post" | "blog" | "ad" | "email" | "other";
export type ContentStatus =
  | "uploaded"
  | "checking"
  | "needs_changes"
  | "in_review"
  | "approved"
  | "returned"
  | "failed";
export type CheckStatus = "queued" | "running" | "done" | "failed";
export type FindingSource = "rule_engine" | "ai";
export type FindingStatus =
  | "open"
  | "fix_accepted"
  | "fix_rejected"
  | "overridden"
  | "needs_human";
export type AssignedRole = "creator" | "reviewer";
export type DecisionAction =
  | "approved"
  | "returned"
  | "fix_accepted"
  | "fix_rejected"
  | "override";

export type Severity = "low" | "medium" | "high";

// ===== Kit rule payload contracts (consumed by M4 checkers / M6 AI) =========

export type BrandColorPayload = {
  colors: { name: string; hex: string }[];
  max_delta_e: number;
}

export type BannedTermPayload = {
  terms: string[];
}

export type ApprovedClaimPayload = {
  allowed: string[];
  explicitly_disallowed: string[];
}

export type DisclaimerPayload = {
  trigger_terms: string[];
  required_text: string;
}

export type TonePayload = {
  voice: string;
  avoid: string[];
}

export type TerminologyPayload = {
  preferred: string;
  avoid: string[];
}

export type AltTextPayload = {
  require_alt_text: boolean;
  min_length: number;
}

// ===== Tables ================================================================

export type Workspace = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export type Profile = {
  id: string;
  workspace_id: string | null;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export type BrandKit = {
  id: string;
  workspace_id: string;
  name: string;
  current_version_id: string | null;
  created_at: string;
}

export type KitVersion = {
  id: string;
  kit_id: string;
  version_number: number;
  status: KitVersionStatus;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
}

export type KitRule = {
  id: string;
  kit_version_id: string;
  rule_type: RuleType;
  name: string;
  payload: Json;
  severity_default: Severity;
  is_active: boolean;
  created_at: string;
}

export type ContentItem = {
  id: string;
  workspace_id: string;
  kit_version_id: string;
  created_by: string;
  context_type: ContextType;
  source_kind: SourceKind;
  storage_path: string | null;
  text_content: string | null;
  alt_text: string | null;
  status: ContentStatus;
  parent_item_id: string | null;
  created_at: string;
}

export type Check = {
  id: string;
  content_item_id: string;
  status: CheckStatus;
  error: string | null;
  summary: Json | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export type Finding = {
  id: string;
  check_id: string;
  content_item_id: string;
  kit_rule_id: string | null;
  source: FindingSource;
  title: string;
  explanation: string;
  location: Json | null;
  severity: Severity;
  confidence: number | null;
  suggested_fix: string | null;
  assigned_to_role: AssignedRole;
  needs_human: boolean;
  status: FindingStatus;
  created_at: string;
}

export type Comment = {
  id: string;
  content_item_id: string;
  finding_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
}

export type DecisionLog = {
  id: string;
  content_item_id: string;
  finding_id: string | null;
  actor_id: string;
  action: DecisionAction;
  reason: string | null;
  created_at: string;
}

// ===== Insert / Update helpers ===============================================

// Inserts: omit DB-generated columns (id, created_at) and keep DB defaults
// optional. Written by hand; regenerate via CLI when linked.

export type WorkspaceInsert = Pick<Workspace, "name"> &
  Partial<Pick<Workspace, "created_by">>;
export type ProfileInsert = Pick<Profile, "id"> &
  Partial<Pick<Profile, "workspace_id" | "full_name" | "role">>;
export type BrandKitInsert = Pick<BrandKit, "workspace_id" | "name"> &
  Partial<Pick<BrandKit, "current_version_id">>;
export type KitVersionInsert = Pick<KitVersion, "kit_id" | "version_number"> &
  Partial<Pick<KitVersion, "status" | "published_at" | "created_by">>;
export type KitRuleInsert = Pick<
  KitRule,
  "kit_version_id" | "rule_type" | "name"
> &
  Partial<Pick<KitRule, "payload" | "severity_default" | "is_active">>;
export type ContentItemInsert = Pick<
  ContentItem,
  "workspace_id" | "kit_version_id" | "created_by" | "source_kind"
> &
  Partial<
    Pick<
      ContentItem,
      | "context_type"
      | "storage_path"
      | "text_content"
      | "alt_text"
      | "status"
      | "parent_item_id"
    >
  >;
export type CheckInsert = Pick<Check, "content_item_id"> &
  Partial<Pick<Check, "status" | "error" | "summary" | "started_at" | "finished_at">>;
export type FindingInsert = Pick<
  Finding,
  | "check_id"
  | "content_item_id"
  | "source"
  | "title"
  | "explanation"
> &
  Partial<
    Pick<
      Finding,
      | "kit_rule_id"
      | "location"
      | "severity"
      | "confidence"
      | "suggested_fix"
      | "assigned_to_role"
      | "needs_human"
      | "status"
    >
  >;
export type CommentInsert = Pick<Comment, "content_item_id" | "author_id" | "body"> &
  Partial<Pick<Comment, "finding_id">>;
export type DecisionLogInsert = Pick<
  DecisionLog,
  "content_item_id" | "actor_id" | "action"
> &
  Partial<Pick<DecisionLog, "finding_id" | "reason">>;

type UpdateOf<Row> = { [K in keyof Row]?: Row[K] | null };

// ===== supabase-js Database shape ============================================

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: Workspace;
        Insert: WorkspaceInsert;
        Update: UpdateOf<Workspace>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: UpdateOf<Profile>;
        Relationships: [];
      };
      brand_kits: {
        Row: BrandKit;
        Insert: BrandKitInsert;
        Update: UpdateOf<BrandKit>;
        Relationships: [];
      };
      kit_versions: {
        Row: KitVersion;
        Insert: KitVersionInsert;
        Update: UpdateOf<KitVersion>;
        Relationships: [];
      };
      kit_rules: {
        Row: KitRule;
        Insert: KitRuleInsert;
        Update: UpdateOf<KitRule>;
        Relationships: [];
      };
      content_items: {
        Row: ContentItem;
        Insert: ContentItemInsert;
        Update: UpdateOf<ContentItem>;
        Relationships: [];
      };
      checks: {
        Row: Check;
        Insert: CheckInsert;
        Update: UpdateOf<Check>;
        Relationships: [];
      };
      findings: {
        Row: Finding;
        Insert: FindingInsert;
        Update: UpdateOf<Finding>;
        Relationships: [];
      };
      comments: {
        Row: Comment;
        Insert: CommentInsert;
        Update: UpdateOf<Comment>;
        Relationships: [];
      };
      decision_log: {
        Row: DecisionLog;
        Insert: DecisionLogInsert;
        Update: UpdateOf<DecisionLog>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      user_role: UserRole;
      kit_version_status: KitVersionStatus;
      rule_type: RuleType;
      source_kind: SourceKind;
      context_type: ContextType;
      content_status: ContentStatus;
      check_status: CheckStatus;
      finding_source: FindingSource;
      finding_status: FindingStatus;
      assigned_role: AssignedRole;
      decision_action: DecisionAction;
    };
  };
};
