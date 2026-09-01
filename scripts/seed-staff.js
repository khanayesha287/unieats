#!/usr/bin/env node

/**
 * UniEats Staff Account Seeder
 *
 * Creates the 3 required staff accounts (admin, canteen_owner, driver)
 * in Supabase Auth + staff_profiles database table.
 *
 * Requirements:
 *   1. Run the migration first:  supabase-migrations/create-staff-profiles.sql
 *   2. Fill in .env.local with:
 *        SUPABASE_SERVICE_ROLE_KEY  (from Supabase Dashboard → Settings → API)
 *        ADMIN_EMAIL, ADMIN_PASSWORD
 *        CANTEEN_OWNER_EMAIL, CANTEEN_OWNER_PASSWORD
 *        DRIVER_EMAIL, DRIVER_PASSWORD
 *
 * Usage:
 *   cd frontend
 *   node scripts/seed-staff.js
 *
 * This script:
 *   - Uses the Supabase service-role key (server-only, never exposed to browser)
 *   - Auto-confirms email for staff accounts
 *   - Is idempotent — skips existing users/profiles
 *   - Does NOT hardcode any credentials — reads everything from env vars
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// 1. Parse .env.local (dotenv is not a project dependency)
// ---------------------------------------------------------------------------
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const envPath = path.resolve(__dirname, "..", ".env.local");
loadEnvFile(envPath);

// ---------------------------------------------------------------------------
// 2. Read & validate environment variables
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const STAFF_ACCOUNTS = [
  {
    label: "Admin",
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    role: "admin",
    needsCanteen: false,
  },
  {
    label: "Canteen Owner",
    email: process.env.CANTEEN_OWNER_EMAIL,
    password: process.env.CANTEEN_OWNER_PASSWORD,
    role: "canteen_owner",
    needsCanteen: true,
  },
  {
    label: "Driver",
    email: process.env.DRIVER_EMAIL,
    password: process.env.DRIVER_PASSWORD,
    role: "driver",
    needsCanteen: false,
  },
];

const missing = [];
if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
for (const a of STAFF_ACCOUNTS) {
  if (!a.email) missing.push(a.label.toUpperCase().replace(" ", "_") + "_EMAIL");
  if (!a.password)
    missing.push(a.label.toUpperCase().replace(" ", "_") + "_PASSWORD");
}

if (missing.length > 0) {
  console.error("\n[ERROR] Missing required environment variables:\n");
  for (const m of missing) console.error("  - " + m);
  console.error("\nAdd them to .env.local and re-run:\n");
  console.error("  node scripts/seed-staff.js\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Create Supabase client with service-role key
// ---------------------------------------------------------------------------
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ---------------------------------------------------------------------------
// 4. Helper functions
// ---------------------------------------------------------------------------

/**
 * Find an existing auth user by email (case-insensitive).
 */
async function findExistingUser(email) {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw new Error("listUsers failed: " + error.message);
  const users = data?.users ?? [];
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

/**
 * Ensure auth user exists. Create if missing, reuse if found.
 * Returns { user, created }.
 */
async function ensureAuthUser({ email, password, label, role }) {
  const existing = await findExistingUser(email);

  if (existing) {
    // Sync app_metadata.role if missing or incorrect
    const currentRole = existing.app_metadata?.role;
    if (currentRole !== role) {
      await supabase.auth.admin.updateUserById(existing.id, {
        app_metadata: { role: role },
      });
      console.log(
        "  [SYNC] " +
          label +
          " app_metadata.role updated" +
          (currentRole ? " (" + currentRole + " -> " + role + ")" : " (set to " + role + ")")
      );
    } else {
      console.log(
        "  [SKIP] " + label + " auth user exists (" + existing.id.slice(0, 8) + "...)"
      );
    }
    return { user: existing, created: false };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true, // Auto-confirm — controlled staff accounts
    role: role,
    app_metadata: { role: role },
  });

  if (error || !data.user) {
    throw new Error(
      "Failed to create " + label + " auth user: " + (error?.message ?? "unknown")
    );
  }

  console.log(
    "  [NEW]  " + label + " auth user created (" + data.user.id.slice(0, 8) + "...)"
  );
  return { user: data.user, created: true };
}

/**
 * Ensure staff_profiles row exists and is in sync with the auth user.
 * - Insert if missing
 * - Update role/email/active if out of sync
 */
async function ensureStaffProfile(user, { email, role, label, canteenId }) {
  // Derive display name
  const name =
    label === "Admin"
      ? "Administrator"
      : label === "Canteen Owner"
        ? "Canteen Owner"
        : "Driver";

  // Check if profile already exists
  const { data: existing } = await supabase
    .from("staff_profiles")
    .select("id, email, name, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) {
    // Check if anything is out of sync
    const needsUpdate =
      existing.email !== email ||
      existing.role !== role ||
      !existing.active;

    if (needsUpdate) {
      const updates = {};
      if (existing.email !== email) updates.email = email;
      if (existing.role !== role) updates.role = role;
      if (!existing.active) updates.active = true;
      updates.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from("staff_profiles")
        .update(updates)
        .eq("id", user.id);

      if (error) {
        throw new Error(
          "Failed to sync " + label + " profile: " + error.message
        );
      }
      console.log(
        "  [SYNC] " +
          label +
          " profile updated" +
          (existing.role !== role
            ? " (role: " + existing.role + " -> " + role + ")"
            : "") +
          (!existing.active ? " (reactivated)" : "")
      );
    } else {
      console.log("  [SKIP] " + label + " staff profile in sync");
    }
    return;
  }

  // No profile — create one using the auth user's UUID
  const { error } = await supabase.from("staff_profiles").insert({
    id: user.id,
    email: email,
    name: name,
    role: role,
    canteen_id: canteenId ?? null,
    active: true,
  });

  if (error) {
    throw new Error(
      "Failed to create " + label + " profile: " + error.message
    );
  }

  console.log("  [NEW]  " + label + " staff profile created (id: " + user.id.slice(0, 8) + "...)");
}

// ---------------------------------------------------------------------------
// 5. Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=".repeat(60));
  console.log("  UniEats Staff Account Seeder");
  console.log("=".repeat(60));
  console.log("");

  // Verify service-role connection
  console.log("Connecting to Supabase...");
  console.log("  URL: " + SUPABASE_URL);
  console.log("  Key: " + SERVICE_ROLE_KEY.slice(0, 20) + "...[hidden]");
  console.log("");

  const { data: userList, error: userErr } =
    await supabase.auth.admin.listUsers();
  if (userErr) {
    console.error(
      "[FATAL] Cannot connect with service-role key: " + userErr.message
    );
    console.error(
      "\nVerify SUPABASE_SERVICE_ROLE_KEY in .env.local\n" +
        "Get it from: Supabase Dashboard > Settings > API > service_role key (secret)\n"
    );
    process.exit(1);
  }
  console.log("  Connected. Existing auth users: " + (userList?.users?.length ?? 0));
  console.log("");

  // Resolve canteen_id for canteen_owner
  // Optional: set CANTEEN_OWNER_CANTEEN in .env.local to the canteen name (e.g. "SSC")
  // Defaults to "SSC" if not specified.
  let canteenId = null;
  const preferredName = process.env.CANTEEN_OWNER_CANTEEN || "SSC";
  const { data: allCanteens } = await supabase
    .from("canteens")
    .select("id, name")
    .order("name");

  if (allCanteens?.length) {
    console.log("  Available canteens:");
    for (const c of allCanteens) {
      console.log("    - " + c.name + " (id: " + c.id + ")");
    }

    const match = allCanteens.find(
      (c) => c.name.toLowerCase() === preferredName.toLowerCase()
    );

    if (match) {
      canteenId = match.id;
      console.log("");
      console.log("  Canteen for owner: " + match.name + " (id: " + match.id + ")");
    } else {
      // Fall back to first canteen
      canteenId = allCanteens[0].id;
      console.log("");
      console.log(
        "  [WARN] Canteen '" + preferredName + "' not found."
      );
      console.log(
        "  Falling back to: " + allCanteens[0].name + " (id: " + allCanteens[0].id + ")"
      );
      console.log(
        "  To select a specific canteen, add CANTEEN_OWNER_CANTEEN=<name> to .env.local"
      );
    }
  } else {
    console.log("  [WARN] No canteens found — canteen_owner will have null canteen_id");
  }
  console.log("");

  // Seed each account
  console.log("-".repeat(60));
  let success = 0;
  let failed = 0;

  for (const account of STAFF_ACCOUNTS) {
    console.log("");
    console.log(
      "[" +
        account.label.toUpperCase() +
        "] " +
        account.email +
        "  (role: " +
        account.role +
        ")"
    );

    try {
      const cid = account.needsCanteen ? canteenId : null;
      const { user } = await ensureAuthUser(account);
      await ensureStaffProfile(user, {
        email: account.email,
        role: account.role,
        label: account.label,
        canteenId: cid,
      });
      success++;
    } catch (err) {
      console.error("  [ERROR] " + err.message);
      failed++;
    }
  }

  // Summary
  console.log("");
  console.log("=".repeat(60));
  console.log(
    "  Done.  " +
      success +
      " succeeded, " +
      failed +
      " failed."
  );
  console.log("=".repeat(60));

  if (success > 0) {
    console.log("");
    console.log("  Login at: http://localhost:3000/login");
    console.log("");
    console.log("  Portal redirects:");
    console.log("    admin          -> /admin");
    console.log("    canteen_owner  -> /canteen");
    console.log("    driver         -> /driver");
  }
  console.log("");

  if (failed > 0) process.exit(1);
}

main();
