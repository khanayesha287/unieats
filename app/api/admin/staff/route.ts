import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function requireAdmin(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) return { error: NextResponse.json({ error: "Service unavailable" }, { status: 503 }), profile: null };

  const authHeader = request.headers.get("authorization");
  let accessToken: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    accessToken = authHeader.slice(7);
  }

  // Also try to get session from cookies via supabase
  const { data: { user } } = await supabase.auth.getUser(accessToken ?? undefined);

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), profile: null };
  }

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("id, email, name, role, canteen_id, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || !profile.active) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), profile: null };
  }

  return { error: null, profile };
}

// GET: List all staff users
export async function GET(request: NextRequest) {
  const { error, profile } = await requireAdmin(request);
  if (error) return error;

  const supabase = getServerSupabase()!;
  const { data, error: queryError } = await supabase
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
  const { error, profile } = await requireAdmin(request);
  if (error) return error;

  const supabase = getServerSupabase()!;
  const body = await request.json();
  const { email, password, name, role, canteen_id } = body;

  if (!email || !password || !name || !role) {
    return NextResponse.json(
      { error: "Missing required fields: email, password, name, role" },
      { status: 400 },
    );
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Failed to create auth user" },
      { status: 400 },
    );
  }

  // Create staff profile
  const { data: profileData, error: profileError } = await supabase
    .from("staff_profiles")
    .insert({
      id: authData.user.id,
      email,
      name,
      role,
      canteen_id: canteen_id ?? null,
      active: true,
    })
    .select()
    .single();

  if (profileError) {
    // Try to clean up auth user (best effort)
    return NextResponse.json(
      { error: "Profile creation failed: " + profileError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ staff: profileData }, { status: 201 });
}

// PUT: Update a staff user
export async function PUT(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const supabase = getServerSupabase()!;
  const body = await request.json();
  const { id, name, role, canteen_id, active } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing staff id" }, { status: 400 });
  }

  const updateFields: Record<string, unknown> = {};
  if (name !== undefined) updateFields.name = name;
  if (role !== undefined) updateFields.role = role;
  if (canteen_id !== undefined) updateFields.canteen_id = canteen_id;
  if (active !== undefined) updateFields.active = active;
  updateFields.updated_at = new Date().toISOString();

  const { data, error: updateError } = await supabase
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
