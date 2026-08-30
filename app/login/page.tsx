"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { getRedirectForRole } from "@/lib/auth";
import { supabaseAuth } from "@/lib/supabase-auth";
import Link from "next/link";
import Image from "next/image";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, profile, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const redirect = searchParams.get("redirect") || null;

  // If already logged in with a profile, redirect
  useEffect(() => {
    if (!authLoading && profile) {
      const target = redirect || getRedirectForRole(profile.role);
      router.replace(target);
    }
  }, [authLoading, profile, redirect, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabaseAuth) return;
    setResetError(null);
    setIsResetting(true);

    const { error: resetErr } = await supabaseAuth.auth.resetPasswordForEmail(
      resetEmail,
      { redirectTo: window.location.origin + "/login" },
    );

    if (resetErr) {
      setResetError(resetErr.message);
      setIsResetting(false);
      return;
    }

    setResetSent(true);
    setIsResetting(false);
  };

  // Forgot Password view
  if (showForgot) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2E1065] to-[#6C2BD9] px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Link href="/" className="inline-block">
              <Image
                src="/logo.png"
                alt="UniEats"
                width={56}
                height={56}
                className="mx-auto h-14 w-14 rounded-xl object-cover shadow-lg"
              />
            </Link>
            <h1 className="mt-4 text-2xl font-bold text-white">Reset Password</h1>
            <p className="mt-1 text-sm text-white/70">
              Enter your email to receive a reset link
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
            {resetSent ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                  <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-white/90">
                  If an account exists for <span className="font-semibold">{resetEmail}</span>, a password reset link has been sent.
                </p>
                <button
                  onClick={() => { setShowForgot(false); setResetSent(false); setResetEmail(""); }}
                  className="mt-6 text-sm font-semibold text-[#F4C542] transition hover:text-[#F4C542]/80"
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword}>
                {resetError && (
                  <div className="mb-4 rounded-xl bg-red-500/20 p-3 text-sm text-red-200">
                    {resetError}
                  </div>
                )}
                <div className="mb-4">
                  <label htmlFor="reset-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/60">
                    Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 outline-none transition focus:border-[#F4C542] focus:bg-white/15"
                    placeholder="staff@unieats.pk"
                    autoComplete="email"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="w-full rounded-xl bg-[#F4C542] py-3 text-sm font-bold text-[#2E1065] shadow-lg transition hover:bg-[#F4C542]/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isResetting ? "Sending..." : "Send Reset Link"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="mt-4 w-full text-center text-sm text-white/60 transition hover:text-white"
                >
                  Back to Login
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2E1065] to-[#6C2BD9] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <Image
              src="/logo.png"
              alt="UniEats"
              width={56}
              height={56}
              className="mx-auto h-14 w-14 rounded-xl object-cover shadow-lg"
            />
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-white">UniEats Staff Login</h1>
          <p className="mt-1 text-sm text-white/70">
            Sign in to access your portal
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl"
        >
          {error && (
            <div className="mb-4 rounded-xl bg-red-500/20 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/60"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 outline-none transition focus:border-[#F4C542] focus:bg-white/15"
                placeholder="staff@unieats.pk"
                autoComplete="email"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold uppercase tracking-wider text-white/60"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setResetEmail(email); setResetSent(false); setResetError(null); }}
                  className="text-xs text-white/50 transition hover:text-[#F4C542]"
                >
                  Forgot Password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 outline-none transition focus:border-[#F4C542] focus:bg-white/15"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 w-full rounded-xl bg-[#F4C542] py-3 text-sm font-bold text-[#2E1065] shadow-lg transition hover:bg-[#F4C542]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Signing in..." : "Login"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-white/60 transition hover:text-white"
          >
            &larr; Back to UniEats
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#2E1065] to-[#6C2BD9]">
          <p className="text-white/70">Loading...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
