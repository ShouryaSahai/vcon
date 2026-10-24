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
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      {authError && (
        <p className="mb-4 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Sign-in link was invalid or expired. Please sign in again.
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-secondary p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`rounded px-3 py-1.5 ${mode === "signin" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`rounded px-3 py-1.5 ${mode === "signup" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <label className="block">
            <span className="text-sm font-medium text-foreground/85">Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm focus:border-ring focus:outline-none"
              placeholder="Your name"
            />
          </label>
        )}

        <label className="block">
          <span className="text-sm font-medium text-foreground/85">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm focus:border-ring focus:outline-none"
            placeholder="you@company.com"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-foreground/85">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm focus:border-ring focus:outline-none"
            placeholder="At least 8 characters"
          />
        </label>

        {error && (
          <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-md border border-success-border bg-success-soft px-3 py-2 text-sm text-success">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        New accounts start as <strong>Creator</strong> with no workspace. Your workspace admin
        assigns roles and workspace access — never through this form.
      </p>
    </div>
  );
}
