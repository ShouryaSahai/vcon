import { Suspense } from "react";

import { isSupabaseConfigured } from "@/lib/env";

import { LoginForm } from "./login-form";

/**
 * Static shell: the login screen paints instantly. Only the searchParams
 * read (the error flag) streams in behind a boundary.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Vcon</h1>
          <p className="mt-1 text-sm text-muted-foreground">Brand governance before publication</p>
        </div>

        {!isSupabaseConfigured ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">Supabase is not configured yet.</p>
            <p className="mt-1">
              Copy <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
              <code className="rounded bg-amber-100 px-1">.env.local</code>, fill in your Supabase
              URL and anon key, then restart the server.
            </p>
          </div>
        ) : (
          <Suspense fallback={<LoginForm authError={false} />}>
            <LoginInner searchParams={searchParams} />
          </Suspense>
        )}
      </div>
    </main>
  );
}

async function LoginInner({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm authError={error === "auth"} />;
}
