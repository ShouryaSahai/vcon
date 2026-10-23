import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ContentStatus } from "@/lib/db-types";
import { createClient } from "@/lib/supabase/server";

// Session-reading page (Cache Components opt-out).
export const instant = false;

const STATUS_VARIANT: Record<ContentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  uploaded: "outline",
  checking: "secondary",
  needs_changes: "destructive",
  in_review: "default",
  approved: "secondary",
  returned: "destructive",
  failed: "destructive",
};

export default async function ItemsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>No workspace yet</CardTitle>
          <CardDescription>
            Attach your account to a workspace to see content items (RLS enforced).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { data: items } = await supabase
    .from("content_items")
    .select("id, context_type, source_kind, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Content items</h1>
        <Link
          href="/upload"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Upload
        </Link>
      </div>

      {!items || items.length === 0 ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Nothing here yet</CardTitle>
            <CardDescription>
              Upload text or an image to run it through the brand kit checks.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/items/${item.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-slate-300"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">
                  {item.source_kind === "text" ? "Text" : "Image"} ·{" "}
                  {item.context_type.replace("_", " ")}
                </span>
                <Badge variant={STATUS_VARIANT[item.status]}>{item.status.replace("_", " ")}</Badge>
              </div>
              <span className="text-xs text-slate-500">
                {new Date(item.created_at).toLocaleString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
