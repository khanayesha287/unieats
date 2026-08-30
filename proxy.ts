import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env vars are missing, let the request through rather than crashing.
  // Authenticated routes will still be protected by the page-level checks.
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[UniEats proxy] Missing NEXT_PUBLIC_SUPABASE_URL or anon/publishable key - proxy running in pass-through mode."
    );
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // Apply cache-control headers required by @supabase/ssr
          // to prevent CDN caching of auth cookie responses.
          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              supabaseResponse.headers.set(key, value),
            );
          }
        },
      },
    });

    // Refresh the session to keep it alive
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;
    const protectedRoutes: Record<string, string[]> = {
      "/admin": ["admin"],
      "/canteen": ["canteen_owner", "admin"],
      "/driver": ["driver", "admin"],
    };

    let matchedRoute: string | null = null;
    for (const route of Object.keys(protectedRoutes)) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        matchedRoute = route;
        break;
      }
    }

    // Public route - pass through
    if (!matchedRoute) return supabaseResponse;

    // Protected route - no session - redirect to login
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }

    // Fetch staff profile for RBAC
    const { data: profile } = await supabase
      .from("staff_profiles")
      .select("role, active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.active) {
      const url = request.nextUrl.clone();
      url.pathname = "/access-denied";
      return NextResponse.redirect(url);
    }

    const allowedRoles = protectedRoutes[matchedRoute];
    if (!allowedRoles.includes(profile.role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/access-denied";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (err) {
    // Catch-all: log the error and let the request through.
    // This prevents MIDDLEWARE_INVOCATION_FAILED from crashing the site.
    console.error("[UniEats proxy] Unhandled error:", err);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};