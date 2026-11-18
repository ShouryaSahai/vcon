import React, { Suspense } from "react";
import { LoginForm } from "./login-form";

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400 text-sm font-mono">
          Initializing Vcon workspace...
        </div>
      }
    >
      <LoginForm searchParams={searchParams} />
    </Suspense>
  );
}