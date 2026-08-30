"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { getRoleBadge } from "@/lib/auth";

export default function AccessDeniedPage() {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8f5ff] px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-10 w-10 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-slate-900">Access Denied</h1>
        <p className="mt-3 text-base text-slate-600">
          You don&apos;t have permission to access this page.
        </p>

        {profile && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <p className="text-slate-500">Logged in as</p>
            <p className="mt-1 font-semibold text-slate-900">{profile.name}</p>
            <p className="text-slate-500">{profile.email}</p>
            <p className="mt-1 text-violet-600 font-medium">
              Role: {getRoleBadge(profile.role)}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-full bg-[#6C2BD9] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#5a22b8]"
          >
            Return to Home
          </Link>
          {profile && (
            <button
              onClick={() => signOut()}
              className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
