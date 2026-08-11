-- TrustEngine — Database Cleanup & Fix Script
-- Run in Supabase Dashboard → SQL Editor → New Query → Run

-- 1. Clean rebuild qr_sessions
DROP TABLE IF EXISTS qr_sessions CASCADE;
CREATE TABLE qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE qr_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qr_sessions_service_only ON qr_sessions;
CREATE POLICY qr_sessions_service_only ON qr_sessions FOR ALL USING (false) WITH CHECK (false);

-- 2. Ensure feedback table exists
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_tenant_isolation ON feedback;
CREATE POLICY feedback_tenant_isolation ON feedback FOR ALL USING (tenant_id IN (
  SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
));

-- 3. Fix user_tenants RLS recursion
DROP POLICY IF EXISTS user_tenants_tenant_isolation ON user_tenants;
CREATE POLICY user_tenants_tenant_isolation ON user_tenants FOR ALL USING (user_id = auth.uid());

-- 4. Ensure tenant exists and is linked
DO $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'info@beyondx.llc';
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User info@beyondx.llc not found. They need to sign up first.';
    RETURN;
  END IF;

  SELECT t.id INTO v_tenant_id
  FROM tenants t
  JOIN user_tenants ut ON ut.tenant_id = t.id
  WHERE ut.user_id = v_user_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants (name, slug, plan_type, subscription_status)
    VALUES ('Beyond X LLC', 'beyondx-llc', 'hook', 'trialing')
    RETURNING id INTO v_tenant_id;

    INSERT INTO user_tenants (user_id, tenant_id, role)
    VALUES (v_user_id, v_tenant_id, 'owner')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Created tenant Beyond X LLC and linked user';
  ELSE
    RAISE NOTICE 'Tenant already exists: %', v_tenant_id;
  END IF;
END $$;

-- 5. Add sample feedback for testing (optional — delete after)
-- DELETE FROM feedback WHERE comment = 'Sample test feedback';
-- INSERT INTO feedback (tenant_id, rating, comment, customer_email)
-- SELECT id, 5, 'Sample test feedback', 'test@example.com'
-- FROM tenants WHERE slug = 'beyondx-llc';
