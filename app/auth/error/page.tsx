"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function InvitationErrorContent() {
  const searchParams = useSearchParams();
  const message =
    searchParams.get("message") ??
    "This authentication link is invalid or has expired. Ask an administrator to send a new invitation.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f5ff] px-4">
      <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl text-red-700">
          !
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">Invitation problem</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          Go to staff login
        </Link>
      </div>
    </div>
  );
}

export default function InvitationErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f8f5ff] text-sm text-slate-600">
          Loading…
        </div>
      }
    >
      <InvitationErrorContent />
    </Suspense>
  );
}
