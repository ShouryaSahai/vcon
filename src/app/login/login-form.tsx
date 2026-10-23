"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function LoginForm({ authError }: { authError: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    const supabase = createClient();

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(error.message);
          return;
        }
        router.replace("/");
        router.refresh();
      } else {
        // SECURITY: no role is sent in user metadata. Signup always lands as
        // role 'creator' with no workspace; elevation happens only through
        // trusted operations (supabase/bootstrap.sql or admin actions in-app).
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) {
          setError(error.message);
          return;
        }
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setNotice(
            "Account created. Check your inbox to confirm your email, then sign in. " +
              "(For the demo you can disable email confirmation: Supabase → Authentication → Providers → Email.)",
          );
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      {authError && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Sign-in link was invalid or expired. Please sign in again.
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`rounded px-3 py-1.5 ${mode === "signin" ? "bg-white shadow-sm" : "text-slate-500"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`rounded px-3 py-1.5 ${mode === "signup" ? "bg-white shadow-sm" : "text-slate-500"}`}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              placeholder="Your name"
            />
          </label>
        )}

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            placeholder="you@company.com"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            placeholder="At least 8 characters"
          />
        </label>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        New accounts start as <strong>Creator</strong> with no workspace. Your workspace admin
        assigns roles and workspace access — never through this form.
      </p>
    </div>
  );
}
