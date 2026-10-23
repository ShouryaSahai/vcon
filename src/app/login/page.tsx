import { isSupabaseConfigured } from "@/lib/env";

// Reads searchParams at request time (Cache Components opt-out).
export const instant = false;

import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Vcon</h1>
          <p className="mt-1 text-sm text-slate-500">Brand governance before publication</p>
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
          <LoginForm authError={error === "auth"} />
        )}
      </div>
    </main>
  );
}
