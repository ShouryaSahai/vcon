import { redirect } from "next/navigation";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

import { UploadForm } from "./upload-form";

// Session-reading page (Cache Components opt-out).
export const instant = false;

export default async function UploadPage() {
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
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>No workspace yet</CardTitle>
          <CardDescription>
            Your account is not attached to a workspace, so you cannot upload
            content (RLS enforced). Ask an admin to attach you.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // The version every check must run against: the kit's current published one.
  const { data: kit } = await supabase
    .from("brand_kits")
    .select("id, current_version_id")
    .maybeSingle();

  const { data: currentVersion } = kit?.current_version_id
    ? await supabase
        .from("kit_versions")
        .select("id, version_number")
        .eq("id", kit.current_version_id)
        .maybeSingle()
    : { data: null };

  if (!kit || !currentVersion) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>No published brand kit</CardTitle>
          <CardDescription>
            Content is checked against the kit's current published version.
            An admin needs to create and publish a brand kit first.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Upload content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          It will be checked against kit v{currentVersion.version_number} (published) before
          review.
        </p>
      </div>
      <UploadForm
        workspaceId={profile.workspace_id}
        kitVersionId={currentVersion.id}
      />
    </div>
  );
}
