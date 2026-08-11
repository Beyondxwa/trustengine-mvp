-- ============================================
-- TrustEngine ERROR 1 fix — run in Supabase SQL Editor
-- Project: glpemdsqzcawrlnryppn
-- ============================================

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

CREATE INDEX idx_qr_sessions_tenant ON qr_sessions(tenant_id);
CREATE INDEX idx_qr_sessions_session_id ON qr_sessions(session_id);
CREATE INDEX idx_qr_sessions_token ON qr_sessions(token);
CREATE INDEX idx_qr_sessions_created_at ON qr_sessions(created_at);

ALTER TABLE qr_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can view QR sessions" ON qr_sessions;
DROP POLICY IF EXISTS qr_sessions_service_only ON qr_sessions;

CREATE POLICY qr_sessions_service_only ON qr_sessions
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Only restore FK if feedback_submissions already exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'feedback_submissions'
  ) THEN
    ALTER TABLE feedback_submissions
      DROP CONSTRAINT IF EXISTS feedback_submissions_qr_session_id_fkey;
    ALTER TABLE feedback_submissions
      ADD CONSTRAINT feedback_submissions_qr_session_id_fkey
      FOREIGN KEY (qr_session_id) REFERENCES qr_sessions(id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
