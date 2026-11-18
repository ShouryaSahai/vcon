"use client";

import React, { useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface LoginFormProps {
  searchParams: Promise<{ error?: string }>;
}

function VconBrandMark() {
  return (
    <div className="inline-flex items-center gap-3 select-none">
      <svg
        viewBox="0 0 180 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-9 w-9 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
        aria-hidden="true"
      >
        <mask
          id="vcon-n-login"
          style={{ maskType: "alpha" }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="180"
          height="180"
        >
          <circle cx="90" cy="90" r="90" fill="black" />
        </mask>
        <g mask="url(#vcon-n-login)">
          <circle cx="90" cy="90" r="90" fill="black" />
          <path
            d="M149.508 157.52L69.142 54H54V125.97H66.1136V69.3836L139.999 164.845C143.333 162.614 146.509 160.165 149.508 157.52Z"
            fill="url(#vcon_n_grad1_login)"
          />
          <rect
            x="115"
            y="54"
            width="12"
            height="72"
            fill="url(#vcon_n_grad2_login)"
          />
        </g>
        <defs>
          <linearGradient
            id="vcon_n_grad1_login"
            x1="109"
            y1="116.5"
            x2="144.5"
            y2="160.5"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="white" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id="vcon_n_grad2_login"
            x1="121"
            y1="54"
            x2="120.799"
            y2="106.875"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="white" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-foreground font-mono">
            Vcon
          </span>
          <span className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
            CORE
          </span>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">
          Compliance & Policy Gate Engine
        </span>
      </div>
    </div>
  );
}

export function LoginForm({ searchParams }: LoginFormProps) {
  const params = use(searchParams);
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    params?.error ? decodeURIComponent(params.error) : null
  );
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    const supabase = createClient();
    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        router.push("/items");
        router.refresh();
      } else {
        // Try creating the account first
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });

        // If the user already exists, seamlessly sign them in with their password
        const alreadyExists =
          error?.message?.toLowerCase().includes("already registered") ||
          (data?.user && data.user.identities && data.user.identities.length === 0);

        if (alreadyExists) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });
          if (signInErr) {
            throw new Error(
              "An account with this email already exists. Please enter your existing password to sign in."
            );
          }
          router.push("/items");
          router.refresh();
          return;
        }

        if (error) throw error;

        if (data.session) {
          router.push("/items");
          router.refresh();
        } else {
          // Fallback sign-in since our DB trigger auto-confirms users immediately
          const { error: autoSignInErr } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });
          if (!autoSignInErr) {
            router.push("/items");
            router.refresh();
          }
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Authentication failed.";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Left Pane: Product Architecture & Contributor Context */}
      <div className="hidden lg:flex lg:col-span-5 flex-col justify-between border-r border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-10 xl:p-14">
        <VconBrandMark />

        <div className="space-y-6 my-auto max-w-md">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            Hybrid Deterministic + LLM Evaluation
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 leading-snug">
            Pre-publication governance with an immutable audit trail.
          </h1>

          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Vcon validates outbound copy against deterministic banned-term
            boundaries, approved claim ledgers, and custom policy rules before
            content ships.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-5 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
            <div className="space-y-1">
              <p className="font-semibold text-zinc-900 dark:text-zinc-200 font-mono">
                01 / Fast-Lane Checks
              </p>
              <p>Deterministic word-boundary & regex lexicons in milliseconds.</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-zinc-900 dark:text-zinc-200 font-mono">
                02 / Role Sign-Off
              </p>
              <p>Creator, Reviewer, and Approver state transitions with receipts.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200/60 dark:border-zinc-800/60 pt-4">
          <span className="font-mono">CON-V / VCON ENGINE</span>
          <span>Open-Source Governance Stack</span>
        </div>
      </div>

      {/* Right Pane: Auth Card */}
      <div className="lg:col-span-7 flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-7">
          <div className="lg:hidden">
            <VconBrandMark />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Sign in to Vcon" : "Create a workspace account"}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {mode === "signin"
                ? "Enter your workspace credentials to access rulebooks and review queues."
                : "New accounts start with Creator permissions until assigned by an admin."}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 rounded-lg bg-zinc-200/70 dark:bg-zinc-900 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`rounded-md py-2 transition-all ${
                mode === "signin"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`rounded-md py-2 transition-all ${
                mode === "signup"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              Create account
            </button>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-400">
              {infoMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@organization.com"
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isLoading
                ? mode === "signin"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "signin"
                ? "Sign in to workspace"
                : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}