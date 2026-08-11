# TrustEngine — Database Schema & RLS Policies

> **Database:** PostgreSQL (Supabase)  
> **Project:** glpemdsqzcawrlnryppn  
> **Last Updated:** August 10, 2026

---

## Complete Schema

Run this SQL in Supabase SQL Editor to set up or reset the entire database.

```sql
-- ============================================
-- TRUSTENGINE COMPLETE DATABASE SETUP
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- TABLES
-- ============================================

-- Tenants: Business accounts
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  primary_color TEXT DEFAULT '#3B82F6',
  secondary_color TEXT DEFAULT '#10B981',
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User-Tenant memberships (many-to-many)
CREATE TABLE IF NOT EXISTS user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

-- Feedback submissions from customers
CREATE TABLE IF NOT EXISTS feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  session_id UUID,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- QR code sessions
CREATE TABLE IF NOT EXISTS qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff invites (pending invitations)
CREATE TABLE IF NOT EXISTS staff_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (CRITICAL)
-- ============================================

-- Tenants RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_user_read ON tenants;
CREATE POLICY tenants_user_read ON tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS tenants_user_update ON tenants;
CREATE POLICY tenants_user_update ON tenants
  FOR UPDATE USING (
    id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

-- User Tenants RLS
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_tenants_self_read ON user_tenants;
CREATE POLICY user_tenants_self_read ON user_tenants
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_tenants_owner_insert ON user_tenants;
CREATE POLICY user_tenants_owner_insert ON user_tenants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_tenants 
      WHERE tenant_id = user_tenants.tenant_id 
      AND user_id = auth.uid() 
      AND role = 'owner'
    )
  );

-- Feedback submissions RLS
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_tenant_read ON feedback_submissions;
CREATE POLICY feedback_tenant_read ON feedback_submissions
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS feedback_public_insert ON feedback_submissions;
CREATE POLICY feedback_public_insert ON feedback_submissions
  FOR INSERT WITH CHECK (true);

-- QR Sessions RLS
ALTER TABLE qr_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qr_tenant_read ON qr_sessions;
CREATE POLICY qr_tenant_read ON qr_sessions
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS qr_tenant_insert ON qr_sessions;
CREATE POLICY qr_tenant_insert ON qr_sessions
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

-- Staff invites RLS
ALTER TABLE staff_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invites_tenant_read ON staff_invites;
CREATE POLICY invites_tenant_read ON staff_invites
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON feedback_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_tenant ON qr_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);

-- ============================================
-- SEED DATA (Optional — for testing)
-- ============================================

-- Create a test tenant (replace with your actual data)
-- INSERT INTO tenants (name, slug) VALUES ('Test Business', 'test-business');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check all tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Check policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies WHERE schemaname = 'public';
```

---

## Table Reference

### `tenants`
Stores business account information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Unique tenant ID |
| `name` | TEXT | NOT NULL | Business display name |
| `slug` | TEXT | UNIQUE, NOT NULL | URL-friendly identifier |
| `primary_color` | TEXT | DEFAULT '#3B82F6' | Brand primary color |
| `secondary_color` | TEXT | DEFAULT '#10B981' | Brand secondary color |
| `logo_url` | TEXT | nullable | Logo image URL |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

### `user_tenants`
Many-to-many link between users and tenants with role assignment.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Unique membership ID |
| `user_id` | UUID | FK → auth.users | Supabase auth user ID |
| `tenant_id` | UUID | FK → tenants | Business tenant ID |
| `role` | TEXT | CHECK ('owner','admin','staff') | User's role |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Join timestamp |

### `feedback_submissions`
Customer feedback collected via QR codes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Unique feedback ID |
| `tenant_id` | UUID | FK → tenants | Business that received feedback |
| `session_id` | UUID | nullable | QR session that generated this |
| `rating` | INTEGER | CHECK (1-5), NOT NULL | Star rating (1-5) |
| `comment` | TEXT | nullable | Written feedback |
| `customer_name` | TEXT | nullable | Customer's name |
| `customer_email` | TEXT | nullable | Customer's email |
| `customer_phone` | TEXT | nullable | Customer's phone |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Submission timestamp |

### `qr_sessions`
QR code generation sessions with expiration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Unique session ID |
| `tenant_id` | UUID | FK → tenants | Business that owns the QR |
| `token` | TEXT | NOT NULL | JWT token embedded in QR |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Session expiration time |
| `used` | BOOLEAN | DEFAULT FALSE | Whether feedback was submitted |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

### `staff_invites`
Pending team member invitations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Unique invite ID |
| `tenant_id` | UUID | FK → tenants | Business inviting |
| `email` | TEXT | NOT NULL | Invitee email |
| `role` | TEXT | CHECK ('admin','staff') | Proposed role |
| `token` | TEXT | NOT NULL | Invite acceptance token |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Invite expiration |
| `accepted` | BOOLEAN | DEFAULT FALSE | Whether accepted |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

---

## RLS Policy Summary

| Table | Policy | Operation | Who Can Access |
|-------|--------|-----------|----------------|
| `tenants` | `tenants_user_read` | SELECT | Members of the tenant |
| `tenants` | `tenants_user_update` | UPDATE | Members of the tenant |
| `user_tenants` | `user_tenants_self_read` | SELECT | The user themselves |
| `user_tenants` | `user_tenants_owner_insert` | INSERT | Tenant owners only |
| `feedback_submissions` | `feedback_tenant_read` | SELECT | Tenant members |
| `feedback_submissions` | `feedback_public_insert` | INSERT | Anyone (public) |
| `qr_sessions` | `qr_tenant_read` | SELECT | Tenant members |
| `qr_sessions` | `qr_tenant_insert` | INSERT | Tenant members |
| `staff_invites` | `invites_tenant_read` | SELECT | Tenant members |

---

## Common Queries

### Get all feedback for a tenant
```sql
SELECT * FROM feedback_submissions 
WHERE tenant_id = 'YOUR_TENANT_ID' 
ORDER BY created_at DESC 
LIMIT 20;
```

### Get tenant members
```sql
SELECT u.email, ut.role, ut.created_at 
FROM user_tenants ut
JOIN auth.users u ON ut.user_id = u.id
WHERE ut.tenant_id = 'YOUR_TENANT_ID';
```

### Get feedback stats
```sql
SELECT 
  COUNT(*) as total_reviews,
  AVG(rating) as avg_rating,
  COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star
FROM feedback_submissions 
WHERE tenant_id = 'YOUR_TENANT_ID';
```

### Clean up old QR sessions
```sql
DELETE FROM qr_sessions 
WHERE expires_at < NOW() - INTERVAL '7 days';
```

---

## Migration Notes

### From `feedback` to `feedback_submissions`
If you previously had a `feedback` table and need to migrate:

```sql
-- Migrate old data
INSERT INTO feedback_submissions (tenant_id, rating, comment, customer_name, customer_email, created_at)
SELECT tenant_id, rating, comment, customer_name, customer_email, created_at
FROM feedback;

-- Drop old table (after verifying migration)
-- DROP TABLE feedback;
```

---

*Document generated from AI-assisted development logs*  
*August 10, 2026*
