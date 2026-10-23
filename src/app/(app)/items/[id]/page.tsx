import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

// Session-reading page (Cache Components opt-out).
export const instant = false;

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS scopes this read to the item's workspace.
  const { data: item } = await supabase
    .from("content_items")
    .select(
      "id, context_type, source_kind, status, text_content, alt_text, storage_path, created_at, kit_version_id, parent_item_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!item) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Item not found</CardTitle>
          <CardDescription>
            It either does not exist or belongs to another workspace (RLS enforced).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { data: version } = await supabase
    .from("kit_versions")
    .select("version_number, status")
    .eq("id", item.kit_version_id)
    .maybeSingle();

  const { data: checks } = await supabase
    .from("checks")
    .select("id, status, error, summary, started_at, finished_at")
    .eq("content_item_id", item.id)
    .order("created_at", { ascending: false });

  const { data: findings } = await supabase
    .from("findings")
    .select("id, title, explanation, severity, source, needs_human, status")
    .eq("content_item_id", item.id)
    .order("created_at");

  // Signed URL for images — the bucket is private; RLS authorises this read.
  let imageUrl: string | null = null;
  if (item.storage_path) {
    const { data: signed } = await supabase.storage
      .from("content")
      .createSignedUrl(item.storage_path, 3600);
    imageUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {item.source_kind === "text" ? "Text" : "Image"} ·{" "}
            {item.context_type.replace("_", " ")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Date(item.created_at).toLocaleString()} · checked against kit v
            {version?.version_number ?? "?"} ({version?.status ?? "unknown"})
            {item.parent_item_id ? " · resubmission" : ""}
          </p>
        </div>
        <Badge variant="default">{item.status.replace("_", " ")}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {item.source_kind === "text" ? (
            <p className="whitespace-pre-wrap text-sm text-slate-800">{item.text_content}</p>
          ) : imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageUrl}
              alt={item.alt_text ?? ""}
              className="max-h-80 rounded-lg border border-slate-200"
            />
          ) : (
            <p className="text-sm text-slate-500">Image stored but no preview available.</p>
          )}
          {item.source_kind === "image" && (
            <p className="text-xs text-slate-500">Alt text: {item.alt_text || "—"}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Findings</CardTitle>
          <CardDescription>
            {findings && findings.length > 0
              ? `${findings.length} finding${findings.length === 1 ? "" : "s"}`
              : "No findings recorded yet — the checkers land in M4/M6."}
          </CardDescription>
        </CardHeader>
        {findings && findings.length > 0 && (
          <CardContent className="space-y-2">
            {findings.map((finding) => (
              <div key={finding.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{finding.title}</span>
                  <Badge variant={finding.severity === "high" ? "destructive" : "secondary"}>
                    {finding.severity}
                  </Badge>
                  <Badge variant="outline">{finding.source === "ai" ? "AI" : "rule engine"}</Badge>
                  {finding.needs_human && <Badge variant="outline">needs human</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-600">{finding.explanation}</p>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!checks || checks.length === 0 ? (
            <p className="text-sm text-slate-500">No checks yet.</p>
          ) : (
            checks.map((check) => (
              <div
                key={check.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="font-mono text-xs text-slate-500">{check.id.slice(0, 8)}</span>
                <Badge
                  variant={
                    check.status === "done"
                      ? "secondary"
                      : check.status === "failed"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {check.status}
                </Badge>
                <span className="text-xs text-slate-500">
                  {check.started_at ? new Date(check.started_at).toLocaleTimeString() : "—"}
                  {check.finished_at
                    ? ` → ${new Date(check.finished_at).toLocaleTimeString()}`
                    : " → …"}
                </span>
                {check.error && <span className="text-xs text-red-600">{check.error}</span>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Link href="/items" className="text-sm text-slate-600 underline-offset-4 hover:underline">
        ← All items
      </Link>
    </div>
  );
}
