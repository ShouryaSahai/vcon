"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Optional judge/demo fast path. Set NEXT_PUBLIC_DEMO_EMAIL +
 * NEXT_PUBLIC_DEMO_PASSWORD in the deployment env (values are public by
 * design — they are demo credentials shown on this screen) and the card
 * below renders a one-click demo sign-in. Absent env → hidden.
 */
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL;
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
const DEMO_READY = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

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

      {DEMO_READY && (
        <div className="mt-4 rounded-lg border border-primary/25 bg-accent/40 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-accent-foreground">
            For judges
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Explore the seeded <strong>GlowNaturals</strong> workspace instantly — findings,
            review queue, and the full decision trail.
          </p>
          <DemoSignIn email={DEMO_EMAIL!} password={DEMO_PASSWORD!} />
        </div>
      )}
    </div>
  );
}

function DemoSignIn({ email, password }: { email: string; password: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function demoSignIn() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={demoSignIn}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 disabled:opacity-60"
      >
        {busy ? "Signing in…" : "⚡ Try the demo"}
      </button>
      <p className="mt-2 break-all font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        {email} · {password}
      </p>
      {error && (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
