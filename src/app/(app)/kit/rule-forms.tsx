"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Json, KitRule, RuleType, Severity } from "@/lib/db-types";
import { RULE_TYPES, RULE_TYPE_LABELS, SEVERITIES } from "@/lib/types";

import {
  addRule,
  deleteRule,
  discardDraft,
  ensureDraft,
  publishDraft,
  setRuleActive,
  updateRule,
  type ActionState,
} from "./actions";

// ===== Payload helpers (contract shapes from src/lib/db-types.ts) ===========

const EMPTY_FIELDS: Record<RuleType, Record<string, string>> = {
  banned_term: { terms: "" },
  required_term: { terms: "" },
  approved_claim: { allowed: "", explicitly_disallowed: "" },
  brand_color: { colors: "", max_delta_e: "10" },
  tone_guideline: { voice: "", avoid: "" },
  disclaimer: { trigger_terms: "", required_text: "" },
  alt_text_policy: { min_length: "20" },
  custom: { preferred: "", avoid: "" },
};

function linesToArr(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function fieldsFromPayload(
  ruleType: RuleType,
  payload: Json | null,
): Record<string, string> {
  const p = (payload ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  switch (ruleType) {
    case "banned_term":
    case "required_term":
      return { terms: arr(p.terms).join("\n") };
    case "approved_claim":
      return {
        allowed: arr(p.allowed).join("\n"),
        explicitly_disallowed: arr(p.explicitly_disallowed).join("\n"),
      };
    case "brand_color": {
      const colors = arr(p.colors).map((raw) => {
        try {
          const c = JSON.parse(raw) as { name?: unknown; hex?: unknown };
          return `${String(c.name ?? "")} ${String(c.hex ?? "")}`.trim();
        } catch {
          return raw;
        }
      });
      return { colors: colors.join("\n"), max_delta_e: String(p.max_delta_e ?? 10) };
    }
    case "tone_guideline":
      return { voice: String(p.voice ?? ""), avoid: arr(p.avoid).join("\n") };
    case "disclaimer":
      return {
        trigger_terms: arr(p.trigger_terms).join("\n"),
        required_text: String(p.required_text ?? ""),
      };
    case "alt_text_policy":
      return { min_length: String(p.min_length ?? 20) };
    case "custom":
      return { preferred: String(p.preferred ?? ""), avoid: arr(p.avoid).join("\n") };
  }
}

function buildPayload(ruleType: RuleType, fields: Record<string, string>): Json {
  switch (ruleType) {
    case "banned_term":
    case "required_term":
      return { terms: linesToArr(fields.terms ?? "") };
    case "approved_claim":
      return {
        allowed: linesToArr(fields.allowed ?? ""),
        explicitly_disallowed: linesToArr(fields.explicitly_disallowed ?? ""),
      };
    case "brand_color": {
      const colors = linesToArr(fields.colors ?? "").map((line) => {
        const match = line.match(/^(.+?)\s+#?([0-9a-fA-F]{3,8})$/);
        if (match) {
          const hex = match[2].startsWith("#") ? match[2] : `#${match[2]}`;
          return { name: match[1].trim(), hex };
        }
        return { name: line, hex: "#000000" };
      });
      const maxDelta = Number(fields.max_delta_e);
      return { colors, max_delta_e: Number.isFinite(maxDelta) ? maxDelta : 10 };
    }
    case "tone_guideline":
      return { voice: (fields.voice ?? "").trim(), avoid: linesToArr(fields.avoid ?? "") };
    case "disclaimer":
      return {
        trigger_terms: linesToArr(fields.trigger_terms ?? ""),
        required_text: (fields.required_text ?? "").trim(),
      };
    case "alt_text_policy": {
      const min = Number(fields.min_length);
      return {
        require_alt_text: true,
        min_length: Number.isFinite(min) ? min : 20,
      };
    }
    case "custom":
      return { preferred: (fields.preferred ?? "").trim(), avoid: linesToArr(fields.avoid ?? "") };
  }
}

function payloadSummary(rule: KitRule): string {
  const p = (rule.payload ?? {}) as Record<string, unknown>;
  const join = (v: unknown, limit = 3) => {
    if (!Array.isArray(v) || v.length === 0) return null;
    const items = v.map(String);
    return items.slice(0, limit).join(", ") + (items.length > limit ? ", …" : "");
  };
  switch (rule.rule_type) {
    case "banned_term":
    case "required_term":
      return join(p.terms) ?? "No terms configured";
    case "approved_claim":
      return `${join(p.allowed) ?? "no approved claims"} · disallowed: ${join(p.explicitly_disallowed) ?? "none"}`;
    case "brand_color": {
      const colors = Array.isArray(p.colors) ? p.colors.length : 0;
      return `${colors} colour${colors === 1 ? "" : "s"} · max ΔE ${String(p.max_delta_e ?? "?")}`;
    }
    case "tone_guideline":
      return String(p.voice ?? "No voice defined");
    case "disclaimer":
      return `when: ${join(p.trigger_terms) ?? "—"} · required text: "${String(p.required_text ?? "")}"`;
    case "alt_text_policy":
      return `required · min length ${String(p.min_length ?? "?")}`;
    case "custom":
      return `prefer "${String(p.preferred ?? "")}" · avoid: ${join(p.avoid) ?? "none"}`;
  }
}

// ===== Form primitives =======================================================

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

function RuleForm({
  mode,
  versionId,
  rule,
  onDone,
}: {
  mode: "add" | "edit";
  versionId?: string;
  rule?: KitRule;
  onDone?: () => void;
}) {
  const [ruleType, setRuleType] = useState<RuleType>(rule?.rule_type ?? "banned_term");
  const [name, setName] = useState(rule?.name ?? "");
  const [severity, setSeverity] = useState<Severity>(rule?.severity_default ?? "medium");
  const [fields, setFields] = useState<Record<string, string>>(() =>
    fieldsFromPayload(rule?.rule_type ?? "banned_term", rule?.payload ?? null),
  );
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === "add" ? addRule : updateRule,
    {},
  );

  // Reset the blank add form once a save returns a message. Done during render
  // (React's "adjust state when a value changes" pattern) rather than in an
  // effect — same value-comparison semantics, no cascading render.
  const [savedMessage, setSavedMessage] = useState(state.message);
  if (state.message !== savedMessage) {
    setSavedMessage(state.message);
    if (state.message && mode === "add") {
      setName("");
      setFields(EMPTY_FIELDS[ruleType]);
    }
  }

  const idPrefix = rule?.id ?? "new";

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-border bg-secondary/50 p-4"
    >
      {mode === "add" && <input type="hidden" name="version_id" value={versionId} />}
      {mode === "edit" && <input type="hidden" name="id" value={rule?.id} />}
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify(buildPayload(ruleType, fields))}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`type-${idPrefix}`}>Rule type</Label>
          {mode === "add" ? (
            <select
              id={`type-${idPrefix}`}
              name="rule_type"
              className={selectClass}
              value={ruleType}
              onChange={(event) => {
                const next = event.target.value as RuleType;
                setRuleType(next);
                setFields(EMPTY_FIELDS[next]);
              }}
            >
              {RULE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {RULE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="rule_type" value={ruleType} />
              <div className="px-1 py-2 text-sm text-muted-foreground">
                {RULE_TYPE_LABELS[ruleType]}
              </div>
            </>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`name-${idPrefix}`}>Rule name</Label>
          <Input
            id={`name-${idPrefix}`}
            name="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Banned: “miracle”"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`severity-${idPrefix}`}>Default severity</Label>
          <select
            id={`severity-${idPrefix}`}
            name="severity"
            className={selectClass}
            value={severity}
            onChange={(event) => setSeverity(event.target.value as Severity)}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <PayloadFields
        ruleType={ruleType}
        fields={fields}
        onChange={(key, value) => setFields((prev) => ({ ...prev, [key]: value }))}
      />

      {state.error && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="rounded-md border border-success-border bg-success-soft px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "add" ? "Add rule" : "Save changes"}
        </Button>
        {onDone && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function PayloadFields({
  ruleType,
  fields,
  onChange,
}: {
  ruleType: RuleType;
  fields: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const textarea = (key: string, label: string, placeholder: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Textarea
        value={fields[key] ?? ""}
        onChange={(event) => onChange(key, event.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </div>
  );
  const text = (key: string, label: string, placeholder: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        value={fields[key] ?? ""}
        onChange={(event) => onChange(key, event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
  const number = (key: string, label: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        value={fields[key] ?? ""}
        onChange={(event) => onChange(key, event.target.value)}
      />
    </div>
  );

  switch (ruleType) {
    case "banned_term":
    case "required_term":
      return textarea("terms", "Terms (one per line)", "miracle\nmiraculous");
    case "approved_claim":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {textarea("allowed", "Approved claims (one per line)", "made with natural ingredients")}
          {textarea(
            "explicitly_disallowed",
            "Explicitly disallowed claims (one per line)",
            "100% natural",
          )}
        </div>
      );
    case "brand_color":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {textarea("colors", "Colours (one per line: Name #RRGGBB)", "Sage #7C9A6D")}
          {number("max_delta_e", "Max ΔE difference allowed")}
        </div>
      );
    case "tone_guideline":
      return (
        <div className="space-y-3">
          {text("voice", "Voice", "Warm, plain-spoken, no hype")}
          {textarea("avoid", "Avoid (one per line)", "ALL-CAPS words")}
        </div>
      );
    case "disclaimer":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {textarea(
            "trigger_terms",
            "Requires disclaimer when content includes (one per line)",
            "clinically proven",
          )}
          {text("required_text", "Required disclaimer text", "Results may vary")}
        </div>
      );
    case "alt_text_policy":
      return number("min_length", "Minimum alt text length (characters)");
    case "custom":
      return (
        <div className="space-y-3">
          {text("preferred", "Preferred form", "GlowNaturals")}
          {textarea("avoid", "Avoid (one per line)", "Glow Naturals")}
        </div>
      );
  }
}

// ===== Rows and controls =====================================================

function RuleRow({ rule, onEdit }: { rule: KitRule; onEdit: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{rule.name}</span>
          <Badge variant={rule.severity_default === "high" ? "destructive" : "secondary"}>
            {rule.severity_default}
          </Badge>
          {!rule.is_active && <Badge variant="outline">inactive</Badge>}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{payloadSummary(rule)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" type="button" onClick={onEdit}>
          Edit
        </Button>
        <form action={setRuleActive}>
          <input type="hidden" name="id" value={rule.id} />
          <input type="hidden" name="is_active" value={rule.is_active ? "false" : "true"} />
          <Button size="sm" variant="ghost" type="submit">
            {rule.is_active ? "Deactivate" : "Activate"}
          </Button>
        </form>
        <form
          action={deleteRule}
          onSubmit={(event) => {
            if (!window.confirm(`Delete rule “${rule.name}”?`)) event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={rule.id} />
          <Button size="sm" variant="destructive" type="submit">
            Delete
          </Button>
        </form>
      </div>
    </div>
  );
}

function EnsureDraftButton({
  kitId,
  nextVersionNumber,
}: {
  kitId: string;
  nextVersionNumber: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    ensureDraft,
    {},
  );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={formAction}>
        <input type="hidden" name="kit_id" value={kitId} />
        <Button type="submit" disabled={pending}>
          {pending
            ? "Preparing…"
            : `Edit rules (creates draft v${nextVersionNumber})`}
        </Button>
      </form>
      <span className="text-xs text-muted-foreground">
        Published versions are immutable — edits happen in a draft.
      </span>
      {state.error && <span className="text-sm text-destructive">{state.error}</span>}
    </div>
  );
}

function PublishControls({
  kitId,
  draftId,
  versionNumber,
}: {
  kitId: string;
  draftId: string;
  versionNumber: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    publishDraft,
    {},
  );
  const [armed, setArmed] = useState(false);
  // Disarm the confirm step once a publish succeeds — adjusted during render
  // (React's "adjust state when a value changes" pattern), not in an effect.
  const [publishedMessage, setPublishedMessage] = useState(state.message);
  if (state.message !== publishedMessage) {
    setPublishedMessage(state.message);
    if (state.message) setArmed(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!armed ? (
        <Button type="button" onClick={() => setArmed(true)}>
          Publish v{versionNumber}
        </Button>
      ) : (
        <>
          <form action={formAction}>
            <input type="hidden" name="kit_id" value={kitId} />
            <input type="hidden" name="draft_id" value={draftId} />
            <Button type="submit" disabled={pending}>
              {pending ? "Publishing…" : `Confirm publish v${versionNumber}`}
            </Button>
          </form>
          <Button type="button" variant="outline" onClick={() => setArmed(false)}>
            Cancel
          </Button>
        </>
      )}
      <form
        action={discardDraft}
        onSubmit={(event) => {
          if (!window.confirm("Discard this draft and all its rule edits?")) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="draft_id" value={draftId} />
        <Button variant="ghost" type="submit">
          Discard draft
        </Button>
      </form>
      {state.error && <span className="text-sm text-destructive">{state.error}</span>}
      {state.message && (
        <span className="text-sm text-success">{state.message}</span>
      )}
    </div>
  );
}

// ===== Admin surface =========================================================

export function KitAdmin({
  kitId,
  draft,
  nextVersionNumber,
  rules,
  editingDraft,
}: {
  kitId: string;
  draft: { id: string; versionNumber: number } | null;
  nextVersionNumber: number;
  rules: KitRule[];
  editingDraft: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6">
      {draft ? (
        <div className="rounded-lg border border-warning-border bg-warning-soft p-4">
          <p className="text-sm font-medium text-warning">
            Draft v{draft.versionNumber} — {rules.length} rule
            {rules.length === 1 ? "" : "s"} · edits stay private until you publish.
          </p>
          <div className="mt-3">
            <PublishControls
              kitId={kitId}
              draftId={draft.id}
              versionNumber={draft.versionNumber}
            />
          </div>
        </div>
      ) : (
        <EnsureDraftButton kitId={kitId} nextVersionNumber={nextVersionNumber} />
      )}

      {RULE_TYPES.map((type) => {
        const group = rules.filter((r) => r.rule_type === type);
        return (
          <section key={type} className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground/85">
              {RULE_TYPE_LABELS[type]}
            </h2>
            {group.length === 0 && (
              <p className="text-sm text-muted-foreground/70">No rules of this type yet.</p>
            )}
            {group.map((rule) =>
              editingId === rule.id ? (
                <RuleForm
                  key={rule.id}
                  mode="edit"
                  rule={rule}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <RuleRow key={rule.id} rule={rule} onEdit={() => setEditingId(rule.id)} />
              ),
            )}
          </section>
        );
      })}

      {editingDraft &&
        (adding ? (
          <RuleForm mode="add" versionId={draft?.id} onDone={() => setAdding(false)} />
        ) : (
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            + Add rule
          </Button>
        ))}
    </div>
  );
}
