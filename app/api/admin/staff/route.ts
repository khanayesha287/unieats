import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getInvitationRedirectUrl(request: NextRequest): string {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  const requestOrigin = new URL(request.url).origin;
  const isProduction = process.env.VERCEL_ENV === "production";
  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null;
  const origin =
    configuredSiteUrl && !/localhost|127\.0\.0\.1/i.test(configuredSiteUrl)
      ? configuredSiteUrl
      : isProduction
        ? vercelProductionUrl || requestOrigin
        : configuredSiteUrl || requestOrigin;
  return `${origin}/auth/callback`;
}

async function requireAdmin(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return {
      error: NextResponse.json({ error: "Server authentication is not configured" }, { status: 503 }),
      profile: null,
      supabase: null,
    };
  }

  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!accessToken) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      profile: null,
      supabase,
    };
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      profile: null,
      supabase,
    };
  }

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("id, email, name, role, canteen_id, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || !profile.active) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      profile: null,
      supabase,
    };
  }

  return { error: null, profile, supabase };
}

// GET: List all staff users
export async function GET(request: NextRequest) {
  const { error, supabase } = await requireAdmin(request);
  if (error) return error;

  const { data, error: queryError } = await supabase!
    .from("staff_profiles")
    .select("id, email, name, role, canteen_id, active, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  return NextResponse.json({ staff: data });
}

// POST: Create a new staff user
export async function POST(request: NextRequest) {
  const { error, supabase } = await requireAdmin(request);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = body.role;
  const canteenId = typeof body.canteen_id === "string" ? body.canteen_id.trim() : "";

  if (!email || !name || (role !== "driver" && role !== "canteen_owner")) {
    return NextResponse.json(
      { error: "Email, name, and a valid staff role are required." },
      { status: 400 },
    );
  }

  if (role === "canteen_owner" && !canteenId) {
    return NextResponse.json(
      { error: "A canteen is required for a canteen owner invitation." },
      { status: 400 },
    );
  }

  if (role === "canteen_owner") {
    const { data: canteen, error: canteenError } = await supabase!
      .from("canteens")
      .select("id")
      .eq("id", canteenId)
      .maybeSingle();
    if (canteenError || !canteen) {
      return NextResponse.json({ error: "The selected canteen does not exist." }, { status: 400 });
    }
  }

  const { data: authData, error: authError } = await supabase!.auth.admin.inviteUserByEmail(
    email,
    {
      data: {
        name,
        role,
        canteen_id: role === "canteen_owner" ? canteenId : null,
      },
      redirectTo: getInvitationRedirectUrl(request),
    },
  );

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Failed to send invitation." },
      { status: 400 },
    );
  }

  const { data: profileData, error: profileError } = await supabase!
    .from("staff_profiles")
    .insert({
      id: authData.user.id,
      email,
      name,
      role,
      canteen_id: role === "canteen_owner" ? canteenId : null,
      active: true,
    })
    .select("id, email, name, role, canteen_id, active")
    .single();

  if (profileError) {
    await supabase!.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json(
      { error: "Invitation was not completed because the staff profile could not be created." },
      { status: 500 },
    );
  }

  return NextResponse.json({ staff: profileData }, { status: 201 });
}

// PUT: Update a staff user
export async function PUT(request: NextRequest) {
  const { error, supabase } = await requireAdmin(request);
  if (error) return error;

  const body = await request.json();
  const { id, name, role, canteen_id, active } = body;

  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Missing staff id" }, { status: 400 });
  }

  const validRoles = ["driver", "canteen_owner", "admin", "student"];
  if (role !== undefined && (typeof role !== "string" || !validRoles.includes(role))) {
    return NextResponse.json({ error: "Invalid staff role" }, { status: 400 });
  }

  const nextRole = role as string | undefined;
  const nextCanteenId = typeof canteen_id === "string" ? canteen_id.trim() : canteen_id;
  if (nextRole === "canteen_owner" && !nextCanteenId) {
    return NextResponse.json({ error: "A canteen is required for a canteen owner" }, { status: 400 });
  }

  if (nextRole === "canteen_owner" || (role === undefined && nextCanteenId)) {
    const { data: canteen, error: canteenError } = await supabase!
      .from("canteens")
      .select("id")
      .eq("id", nextCanteenId)
      .maybeSingle();
    if (canteenError || !canteen) {
      return NextResponse.json({ error: "The selected canteen does not exist." }, { status: 400 });
    }
  }

  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (name !== undefined) updateFields.name = name;
  if (role !== undefined) {
    updateFields.role = role;
    updateFields.canteen_id = role === "canteen_owner" ? nextCanteenId : null;
  } else if (canteen_id !== undefined) {
    updateFields.canteen_id = nextCanteenId || null;
  }
  if (active !== undefined) updateFields.active = Boolean(active);

  const { data, error: updateError } = await supabase!
    .from("staff_profiles")
    .update(updateFields)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ staff: data });
}
