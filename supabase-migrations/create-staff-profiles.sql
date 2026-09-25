-- ================================================================
-- UniEats Staff Profiles Table
-- Stores role-based access control for admin, canteen_owner, driver
-- Must be created BEFORE running the seed script (scripts/seed-staff.js)
-- ================================================================

-- Create staff_profiles table (idempotent)
CREATE TABLE IF NOT EXISTS staff_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'canteen_owner', 'driver', 'student')),
  canteen_id UUID REFERENCES canteens(id),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- RLS Policies
-- ================================================================
-- The service_role key (used by the seed script) bypasses RLS.
-- These policies govern access for authenticated users with the
-- publishable/anon key (i.e. the Admin Dashboard's StaffManagement UI).

-- SELECT: Any active staff member can read the full staff list
DROP POLICY IF EXISTS staff_select_all ON staff_profiles;
CREATE POLICY staff_select_all ON staff_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_profiles sp
      WHERE sp.id = auth.uid() AND sp.active = true
    )
  );

-- INSERT: Only admins can create new staff profiles
DROP POLICY IF EXISTS staff_insert ON staff_profiles;
CREATE POLICY staff_insert ON staff_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff_profiles sp
      WHERE sp.id = auth.uid() AND sp.role = 'admin' AND sp.active = true
    )
  );

-- UPDATE: Only admins can modify staff profiles (name, role, active, canteen_id)
-- Prevents changing the id column to hijack another user's profile
DROP POLICY IF EXISTS staff_update ON staff_profiles;
CREATE POLICY staff_update ON staff_profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_profiles sp
      WHERE sp.id = auth.uid() AND sp.role = 'admin' AND sp.active = true
    )
  );

-- DELETE: Only admins can delete staff profiles
DROP POLICY IF EXISTS staff_delete ON staff_profiles;
CREATE POLICY staff_delete ON staff_profiles
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_profiles sp
      WHERE sp.id = auth.uid() AND sp.role = 'admin' AND sp.active = true
    )
  );

-- ================================================================
-- Indexes
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_staff_profiles_role ON staff_profiles(role);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_email ON staff_profiles(email);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_active ON staff_profiles(active);

-- ================================================================
-- Description
-- ================================================================
COMMENT ON TABLE staff_profiles IS
  'UniEats staff RBAC profiles — maps auth.users to roles (admin, canteen_owner, driver). '
  'Used by proxy.ts for route protection and AuthProvider for login gating.';
