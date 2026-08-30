import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session to keep it alive
  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log('[AUTH DEBUG] Middleware:', { path: request.nextUrl.pathname, hasUser: !!user, userId: user?.id, cookies: request.cookies.getAll().map(c => c.name) });

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

  if (!matchedRoute) return supabaseResponse;

  if (!user) {
    console.log('[AUTH DEBUG] Middleware: No user - redirecting to /login');
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Fetch staff profile
  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();

  console.log('[AUTH DEBUG] Middleware: Staff profile:', { role: profile?.role, active: profile?.active });

  if (!profile || !profile.active) {
    console.log('[AUTH DEBUG] Middleware: No profile or inactive - redirecting to /access-denied');
    const url = request.nextUrl.clone();
    url.pathname = "/access-denied";
    return NextResponse.redirect(url);
  }

  const allowedRoles = protectedRoutes[matchedRoute];
  console.log('[AUTH DEBUG] Middleware: Role check:', { role: profile.role, matchedRoute, allowedRoles });
  if (!allowedRoles.includes(profile.role)) {
    console.log('[AUTH DEBUG] Middleware: Role not allowed - redirecting to /access-denied');
    const url = request.nextUrl.clone();
    url.pathname = "/access-denied";
    return NextResponse.redirect(url);
  }

  console.log('[AUTH DEBUG] Middleware: Access granted');
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
