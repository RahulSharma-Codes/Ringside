-- ============================================================
-- Proposed migration: user_profiles
-- Status: NOT APPLIED — review and approve before running
-- Date: 2025-05-04
-- Description:
--   Adds a user_role enum and a user_profiles table that links
--   Supabase Auth users (auth.users) to application-level roles
--   and display metadata.
--
-- Prerequisites:
--   - Supabase project with Auth enabled (auth schema present)
--   - Service role access to the target database
--
-- To apply:
--   Run against the Supabase database via the SQL editor or psql
--   as a user with CREATE TYPE and CREATE TABLE privileges.
-- ============================================================

-- 1. Role enum
-- Represents the four permission tiers defined in docs/auth-architecture.md.

CREATE TYPE user_role AS ENUM (
  'Admin',
  'Deal Lead',
  'Contributor',
  'Executive Viewer'
);

-- 2. User profiles table
-- One row per application user. auth_user_id is the UUID issued by
-- Supabase Auth (auth.users.id). This table is the single source of
-- truth for role assignments and active status.

CREATE TABLE user_profiles (
  id              SERIAL PRIMARY KEY,

  -- Foreign key to Supabase's managed auth schema.
  -- ON DELETE CASCADE: removing a Supabase user removes their profile.
  auth_user_id    UUID        NOT NULL UNIQUE
                              REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Denormalised for convenience (avoids a join to auth.users on every
  -- request). Must be kept in sync if users change their Supabase email.
  email           TEXT        NOT NULL UNIQUE,

  full_name       TEXT,

  role            user_role   NOT NULL DEFAULT 'Contributor',

  -- Soft-disable: set is_active = false instead of deleting rows so
  -- audit history (if added later) is preserved.
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. updated_at trigger
-- Automatically stamps updated_at whenever a row is modified.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Indexes

-- Lookup by auth_user_id is the primary access pattern (one per request).
CREATE INDEX idx_user_profiles_auth_user_id ON user_profiles (auth_user_id);

-- Filter active users by role (e.g. admin management screens).
CREATE INDEX idx_user_profiles_role_active ON user_profiles (role, is_active);

-- 5. Row-Level Security (RLS) recommendations
--
-- Enable RLS so that direct Supabase client connections cannot bypass
-- application-level access control. The Express API connects via the
-- Supabase SERVICE ROLE key, which bypasses RLS. All user-facing reads
-- must go through the Express layer.
--
-- Uncomment to enable:
--
-- ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
--
-- Allow service role full access (already implicit for service role key,
-- but explicit policy documents intent clearly):
--
-- CREATE POLICY "service_role_all" ON user_profiles
--   FOR ALL TO service_role USING (true) WITH CHECK (true);
--
-- Deny all access to the anon and authenticated roles (they must use
-- the Express API, not direct Supabase client calls):
--
-- CREATE POLICY "deny_anon" ON user_profiles
--   FOR ALL TO anon USING (false);
--
-- CREATE POLICY "deny_authenticated_direct" ON user_profiles
--   FOR ALL TO authenticated USING (false);

-- 6. Initial seed (example — adjust before applying)
--
-- INSERT INTO user_profiles (auth_user_id, email, full_name, role)
-- VALUES
--   ('00000000-0000-0000-0000-000000000001', 'admin@example.com', 'Admin User', 'Admin');
