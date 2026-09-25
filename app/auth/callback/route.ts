import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRedirectForRole, type Role } from "@/lib/auth";

function getPublicOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured && /^https?:\/\//i.test(configured)) return configured;
  return request.nextUrl.origin;
}

function setRedirect(response: NextResponse, origin: string, path: string): NextResponse {
  response.headers.set("Location", new URL(path, origin).toString());
  return response;
}

export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request);
  const errorResponse = NextResponse.redirect(new URL("/auth/error", origin));
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const callbackError = request.nextUrl.searchParams.get("error");
  const callbackDescription = request.nextUrl.searchParams.get("error_description");

  const fail = (message: string) => {
    const path = `/auth/error?message=${encodeURIComponent(message)}`;
    return setRedirect(errorResponse, origin, path);
  };

  if (callbackError) {
    return fail(callbackDescription || callbackError);
  }
  if (!code && !tokenHash) {
    return fail("This invitation link is invalid or incomplete.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return fail("Authentication is not configured on this deployment.");
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          errorResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const authResult = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: "invite",
      });

  if (authResult.error) {
    return fail(
      /expired|invalid|used/i.test(authResult.error.message)
        ? "This invitation link has expired or has already been used. Ask an administrator to send a new invitation."
        : authResult.error.message,
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return fail("The invitation session could not be created. Please request a new invitation.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles")
    .select("role, canteen_id, active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.active) {
    return fail("Your invitation was accepted, but your staff access is not available yet.");
  }

  const role = profile.role as Role;
  if (role !== "admin" && role !== "driver" && role !== "canteen_owner") {
    return fail("This invitation is not assigned to a staff portal.");
  }
  if (role === "canteen_owner" && !profile.canteen_id) {
    return fail("Your canteen owner invitation is missing its canteen assignment.");
  }

  const target =
    role === "canteen_owner"
      ? `/canteen?canteen_id=${encodeURIComponent(String(profile.canteen_id))}`
      : getRedirectForRole(role);
  return setRedirect(errorResponse, origin, target);
}
