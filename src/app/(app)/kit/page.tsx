import { redirect } from "next/navigation";

import { NoWorkspaceNotice } from "@/components/no-workspace-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { KitRule } from "@/lib/db-types";
import { createClient } from "@/lib/supabase/server";
import { RULE_TYPES, RULE_TYPE_LABELS } from "@/lib/types";

import { PaletteContrast } from "@/components/palette-contrast";
import { createKit } from "./actions";
import { KitAdmin } from "./rule-forms";

export default async function KitPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return <NoWorkspaceNotice />;
  }

  const isAdmin = profile.role === "admin";

  const { data: kit } = await supabase
    .from("brand_kits")
    .select("id, name, current_version_id")
    .maybeSingle();

  if (!kit) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Brand kit</CardTitle>
          <CardDescription>
            {isAdmin
              ? "No brand kit exists yet. Create one, then add rules."
              : "No brand kit exists yet. An admin needs to create it."}
          </CardDescription>
        </CardHeader>
        {isAdmin && (
          <CardFooter>
            <form action={createKit}>
              <Button type="submit">Create brand kit</Button>
            </form>
          </CardFooter>
        )}
      </Card>
    );
  }

  const { data: versions } = await supabase
    .from("kit_versions")
    .select("id, version_number, status, published_at")
    .eq("kit_id", kit.id)
    .order("version_number");

  const current = versions?.find((v) => v.id === kit.current_version_id) ?? null;
  const draft = versions?.find((v) => v.status === "draft") ?? null;
  const editable = draft ?? current;

  const { data: rules } = editable
    ? await supabase.from("kit_rules").select("*").eq("kit_version_id", editable.id).order("name")
    : { data: [] as KitRule[] };

  const nextVersionNumber =
    (versions?.reduce((max, v) => Math.max(max, v.version_number), 0) ?? 0) + 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{kit.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {current
            ? `Current version: v${current.version_number} (published) — checks run against this.`
            : "No published version yet."}
          {draft ? ` · Draft v${draft.version_number} in progress.` : ""}
        </p>
      </div>

      {isAdmin ? (
        <KitAdmin
          kitId={kit.id}
          draft={
            draft ? { id: draft.id, versionNumber: draft.version_number } : null
          }
          nextVersionNumber={nextVersionNumber}
          rules={rules ?? []}
          editingDraft={Boolean(draft)}
        />
      ) : (
        <ReadOnlyRules rules={rules ?? []} />
      )}

      <PaletteContrast rules={rules ?? []} />
    </div>
  );
}

function ReadOnlyRules({ rules }: { rules: KitRule[] }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Read-only view — only admins can edit the brand kit.
      </p>
      {RULE_TYPES.map((type) => {
        const group = rules.filter((r) => r.rule_type === type);
        if (group.length === 0) return null;
        return (
          <section key={type} className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground/85">
              {RULE_TYPE_LABELS[type]}
            </h2>
            {group.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <span className="text-sm font-medium text-foreground">{rule.name}</span>
                <Badge
                  variant={rule.severity_default === "high" ? "destructive" : "secondary"}
                >
                  {rule.severity_default}
                </Badge>
                {!rule.is_active && <Badge variant="outline">inactive</Badge>}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
