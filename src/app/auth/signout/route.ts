import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // 303 so the browser follows with a GET after this POST.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
