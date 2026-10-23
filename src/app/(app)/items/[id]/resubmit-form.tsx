"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { resubmitItem } from "./actions";

export function ResubmitForm({
  itemId,
  sourceKind,
  initialText,
  initialAlt,
}: {
  itemId: string;
  sourceKind: "text" | "image" | "docx";
  initialText: string | null;
  initialAlt: string | null;
}) {
  const [state, formAction, pending] = useActionState(resubmitItem, {});
  const [text, setText] = useState(initialText ?? "");
  const [alt, setAlt] = useState(initialAlt ?? "");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="item_id" value={itemId} />

      {sourceKind === "text" ? (
        <div className="space-y-1">
          <Label htmlFor="resubmit-text">Corrected text</Label>
          <Textarea
            id="resubmit-text"
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Apply the accepted fixes, then resubmit for a fresh check…"
          />
          <p className="text-xs text-slate-500">
            Copy the accepted fixes below into the text, adjust wording, and resubmit.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="resubmit-alt">Corrected alt text</Label>
          <Textarea
            id="resubmit-alt"
            rows={2}
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
            placeholder="Describe the image for screen readers…"
          />
          <p className="text-xs text-slate-500">
            The image itself is reused; fix the alt text (min 20 characters) or ask a designer
            to adjust the visual per the findings.
          </p>
        </div>
      )}

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Resubmitting and re-checking…" : "Resubmit for a fresh check"}
      </Button>
    </form>
  );
}
