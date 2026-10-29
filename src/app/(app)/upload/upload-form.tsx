"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ContextType } from "@/lib/db-types";
import { createClient } from "@/lib/supabase/client";
import { MAX_IMAGE_BYTES, formatBytes } from "@/lib/checks/image-limits";

const CONTEXTS = [
  { value: "instagram_post", label: "Instagram post" },
  { value: "blog", label: "Blog" },
  { value: "ad", label: "Ad" },
  { value: "email", label: "Email" },
  { value: "other", label: "Other" },
] as const;

/** Front-door upload guard — same limits the server enforces before decoding. */
function imageFileRejection(file: File): string | null {
  if (file.size > MAX_IMAGE_BYTES) {
    return `That image is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_IMAGE_BYTES)}.`;
  }
  if (file.size === 0) return "That file is empty.";
  if (file.type && !["image/png", "image/jpeg"].includes(file.type)) {
    return "Only PNG and JPEG images are supported.";
  }
  return null;
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function UploadForm({
  workspaceId,
  kitVersionId,
}: {
  workspaceId: string;
  kitVersionId: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"text" | "image" | "pdf">("text");
  const [context, setContext] = useState<ContextType>("instagram_post");
  const [text, setText] = useState("");
  const [altText, setAltText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (kind === "text" && !text.trim()) {
      setError("Write the content first.");
      return;
    }
    if (kind === "image" && !file) {
      setError("Choose an image file.");
      return;
    }
    if (kind === "pdf" && !file) {
      setError("Choose a PDF file.");
      return;
    }
    if (kind === "image" && altText.trim().length < 20) {
      setError("Alt text is required (at least 20 characters) — describe the image for screen readers.");
      return;
    }
    if (kind === "image" && file) {
      const rejection = imageFileRejection(file);
      if (rejection) {
        setError(rejection);
        return;
      }
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      let extractedText: string | null = null;
      if (kind === "pdf" && file) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/extract-pdf", { method: "POST", body: fd });
        const body = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
        if (!res.ok || !body?.text) throw new Error(body?.error ?? "Could not read that PDF.");
        extractedText = body.text;
      }

      // 1) Create the item row (RLS: members insert into their own workspace).
      const { data: item, error: insertError } = await supabase
        .from("content_items")
        .insert({
          workspace_id: workspaceId,
          kit_version_id: kitVersionId,
          created_by: user.id,
          context_type: context,
          source_kind: kind === "image" ? "image" : "text",
          text_content: kind === "text" ? text.trim() : kind === "pdf" ? extractedText : null,
          alt_text: kind === "image" ? altText.trim() : null,
        })
        .select("id")
        .single();
      if (insertError || !item) throw new Error(insertError?.message ?? "Could not create the item.");

      // 2) Images go straight to storage (key INSIDE the bucket; RLS pins the
      // first path segment to the workspace).
      if (kind === "image" && file) {
        const path = `${workspaceId}/${item.id}/${file.name}`;
        const { error: storageError } = await supabase.storage
          .from("content")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (storageError) throw new Error(`Upload failed: ${storageError.message}`);
        const { error: pathError } = await supabase
          .from("content_items")
          .update({ storage_path: path })
          .eq("id", item.id);
        if (pathError) throw new Error(pathError.message);
      }

      // 3) Trigger the check pipeline.
      const response = await fetch("/api/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_item_id: item.id }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Check failed (${response.status}).`);
      }

      router.push(`/items/${item.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Content type</Label>
              <div className="flex gap-2">
                {(["text", "image", "pdf"] as const).map((k) => (
                  <Button
                    key={k}
                    type="button"
                    variant={kind === k ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setKind(k);
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    {k === "text" ? "Text" : k === "image" ? "Image" : "PDF"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="context">Context</Label>
              <select
                id="context"
                className={selectClass}
                value={context}
                onChange={(event) => setContext(event.target.value as ContextType)}
              >
                {CONTEXTS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {kind === "pdf" ? (
            <div className="space-y-1">
              <Label htmlFor="pdf">PDF with selectable text (max 10 MB)</Label>
              <Input
                id="pdf"
                type="file"
                accept="application/pdf"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  if (selected && selected.size > MAX_IMAGE_BYTES) {
                    setFile(null);
                    setError("That PDF is " + formatBytes(selected.size) + " — the limit is " + formatBytes(MAX_IMAGE_BYTES) + ".");
                    return;
                  }
                  setError(null);
                  setFile(selected);
                }}
              />
              <p className="text-xs text-muted-foreground">
                The text is extracted and checked against the same brand rules. Scanned PDFs are not supported yet.
              </p>
            </div>
          ) : kind === "text" ? (
            <div className="space-y-1">
              <Label htmlFor="text">Content</Label>
              <Textarea
                id="text"
                rows={6}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste or write the post text…"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="file">Image (max 10 MB, PNG or JPEG)</Label>
                <Input
                  id="file"
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    const rejection = selected ? imageFileRejection(selected) : null;
                    if (rejection) {
                      setFile(null);
                      setError(rejection);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                      return;
                    }
                    setError(null);
                    setFile(selected);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="alt">Alt text (required, min 20 characters)</Label>
                <Textarea
                  id="alt"
                  rows={2}
                  value={altText}
                  onChange={(event) => setAltText(event.target.value)}
                  placeholder="Describe the image for screen readers…"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? "Uploading and checking…" : "Upload and check"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
