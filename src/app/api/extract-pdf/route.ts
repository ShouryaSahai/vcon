import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

import { MAX_IMAGE_BYTES } from "@/lib/checks/image-limits";
import { createClient } from "@/lib/supabase/server";

const MAX_CHARS = 20000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a PDF file." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "That PDF is too large (10 MB max)." }, { status: 413 });
  }

  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const clean = text.trim();
    if (!clean) {
      return NextResponse.json(
        { error: "No selectable text found. Scanned PDFs are not supported yet." },
        { status: 422 },
      );
    }
    return NextResponse.json({ text: clean.slice(0, MAX_CHARS), pages: totalPages });
  } catch {
    return NextResponse.json({ error: "Could not read that PDF." }, { status: 422 });
  }
}
