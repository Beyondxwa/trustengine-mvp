-- ============================================
-- TrustEngine Database Schema
-- 16 tables with Row Level Security (RLS)
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. TENANTS (Businesses)
-- ============================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3B82F6',
  secondary_color TEXT DEFAULT '#10B981',
  plan_type TEXT NOT NULL DEFAULT 'hook' CHECK (plan_type IN ('hook', 'solo', 'team', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  review_count_monthly INTEGER DEFAULT 0,
  review_limit_monthly INTEGER DEFAULT 3,
  max_devices INTEGER DEFAULT 1,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. USER PROFILES (extends Supabase Auth)
-- ============================================
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  notification_prefs JSONB DEFAULT '{"push": true, "sms": true, "email": true}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. USER TENANTS (Many-to-Many + Roles)
-- ============================================
CREATE TABLE user_tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'manager', 'staff', 'admin')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(user_id, tenant_id)
);

-- ============================================
-- 4. REVIEW PLATFORMS (Google, Yelp, etc.)
-- ============================================
CREATE TABLE review_platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('google', 'yelp', 'facebook')),
  url TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. QR SESSIONS (Scannable QR codes)
-- ============================================
CREATE TABLE qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. FEEDBACK SUBMISSIONS (Customer reviews)
-- ============================================
CREATE TABLE feedback_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  qr_session_id UUID REFERENCES qr_sessions(id),
  customer_phone TEXT,
  customer_email TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  selected_tags TEXT[] DEFAULT '{}',
  comment TEXT,
  nps_score INTEGER CHECK (nps_score >= 0 AND nps_score <= 10),
  is_resolved BOOLEAN DEFAULT false,
  resolution_type TEXT CHECK (resolution_type IN ('ai_coached', 'staff_fixed', 'refunded', 'escalated', 'none')),
  review_platform TEXT CHECK (review_platform IN ('google', 'yelp', 'facebook', 'none')),
  review_url TEXT,
  ai_analysis JSONB,
  staff_notes TEXT,
  on_site_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. AI ANALYSES (AI coaching results)
-- ============================================
CREATE TABLE ai_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feedback_id UUID NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  coaching_advice TEXT,
  suggested_response TEXT,
  tags JSONB DEFAULT '[]',
  cost_usd DECIMAL(10,6),
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. STAFF INVITES
-- ============================================
CREATE TABLE staff_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'manager')),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. NOTIFICATIONS
-- ============================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_feedback', 'negative_alert', 'weekly_pulse', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. AUDIT LOGS
-- ============================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 11. SUPPRESSION LIST (Opt-out phone numbers)
-- ============================================
CREATE TABLE suppression_list (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_hash TEXT UNIQUE NOT NULL,
  phone_last4 TEXT,
  reason TEXT DEFAULT 'opt_out',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 12. FEATURE FLAGS
-- ============================================
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}',
  UNIQUE(tenant_id, flag_name)
);

-- ============================================
-- 13. DEVICE REGISTRATIONS (Mobile push tokens)
-- ============================================
CREATE TABLE device_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  push_token TEXT NOT NULL,
  device_id TEXT,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, push_token)
);

-- ============================================
-- 14. WEEKLY PULSES
-- ============================================
CREATE TABLE weekly_pulses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_feedback INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  positive_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  nps_score DECIMAL(5,2),
  top_tags JSONB DEFAULT '[]',
  ai_summary TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, week_start)
);

-- ============================================
-- 15. WEBHOOK EVENTS
-- ============================================
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'twilio', 'revenuecat', 'anthropic')),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 16. SUBSCRIPTION HISTORY
-- ============================================
CREATE TABLE subscription_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'canceled', 'payment_failed', 'payment_succeeded')),
  plan_type TEXT,
  amount_usd INTEGER,
  stripe_event_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Speed up common queries)
-- ============================================
CREATE INDEX idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant ON user_tenants(tenant_id);
CREATE INDEX idx_qr_sessions_tenant ON qr_sessions(tenant_id);
CREATE INDEX idx_qr_sessions_session_id ON qr_sessions(session_id);
CREATE INDEX idx_qr_sessions_token ON qr_sessions(token);
CREATE INDEX idx_qr_sessions_created_at ON qr_sessions(created_at);
CREATE INDEX idx_feedback_tenant ON feedback_submissions(tenant_id);
CREATE INDEX idx_feedback_rating ON feedback_submissions(rating);
CREATE INDEX idx_feedback_created ON feedback_submissions(created_at);
CREATE INDEX idx_feedback_resolved ON feedback_submissions(is_resolved);
CREATE INDEX idx_ai_analyses_feedback ON ai_analyses(feedback_id);
CREATE INDEX idx_staff_invites_tenant ON staff_invites(tenant_id);
CREATE INDEX idx_staff_invites_token ON staff_invites(token);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_suppression_hash ON suppression_list(phone_hash);
CREATE INDEX idx_webhook_provider ON webhook_events(provider);
CREATE INDEX idx_weekly_pulses_tenant ON weekly_pulses(tenant_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) — THE SECURITY WALL
-- ============================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_pulses ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;

-- Tenants: Users can only see their own tenant(s)
CREATE POLICY "Users can view their tenants" ON tenants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_tenants WHERE user_tenants.tenant_id = tenants.id AND user_tenants.user_id = auth.uid())
  );

-- User Profiles: Users can view all profiles (for team), but only edit their own
CREATE POLICY "Users can view all profiles" ON user_profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid());

-- User Tenants: Users can view their own memberships
CREATE POLICY "Users can view own memberships" ON user_tenants
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM user_tenants ut WHERE ut.tenant_id = user_tenants.tenant_id AND ut.user_id = auth.uid() AND ut.role IN ('owner', 'manager', 'admin')
  ));

-- Review Platforms: Visible to tenant members
CREATE POLICY "Tenant members can view platforms" ON review_platforms
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_tenants WHERE user_tenants.tenant_id = review_platforms.tenant_id AND user_tenants.user_id = auth.uid())
  );

-- QR Sessions: service-role only (edge functions); deny direct client access
CREATE POLICY qr_sessions_service_only ON qr_sessions
  FOR ALL USING (false) WITH CHECK (false);

-- Feedback: Visible to tenant members
CREATE POLICY "Tenant members can view feedback" ON feedback_submissions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_tenants WHERE user_tenants.tenant_id = feedback_submissions.tenant_id AND user_tenants.user_id = auth.uid())
  );

-- AI Analyses: Visible to tenant members
CREATE POLICY "Tenant members can view analyses" ON ai_analyses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_tenants WHERE user_tenants.tenant_id = ai_analyses.tenant_id AND user_tenants.user_id = auth.uid())
  );

-- Staff Invites: Visible to tenant managers/owners
CREATE POLICY "Managers can view invites" ON staff_invites
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_tenants WHERE user_tenants.tenant_id = staff_invites.tenant_id AND user_tenants.user_id = auth.uid() AND user_tenants.role IN ('owner', 'manager', 'admin'))
  );

-- Notifications: Users can only see their own
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- Device Registrations: Users can manage own devices
CREATE POLICY "Users can manage own devices" ON device_registrations
  FOR ALL USING (user_id = auth.uid());

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update `updated_at` timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_feedback_updated_at BEFORE UPDATE ON feedback_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-create tenant on first user signup (via user metadata)
CREATE OR REPLACE FUNCTION public.handle_new_tenant()
RETURNS TRIGGER AS $$
DECLARE
  new_tenant_id UUID;
  business_name TEXT;
BEGIN
  -- Check if this is the first tenant for this user (owner signup)
  business_name := NEW.raw_user_meta_data->>'business_name';
  
  IF business_name IS NOT NULL THEN
    INSERT INTO public.tenants (name, slug, plan_type)
    VALUES (
      business_name,
      lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g')),
      'hook'
    )
    RETURNING id INTO new_tenant_id;
    
    INSERT INTO public.user_tenants (user_id, tenant_id, role, accepted_at)
    VALUES (NEW.id, new_tenant_id, 'owner', NOW());
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: This trigger is optional. If you want auto-tenant creation, run:
-- CREATE TRIGGER on_auth_user_created_tenant
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_tenant();

-- ============================================
-- SEED DATA (Minimal test data)
-- ============================================
INSERT INTO tenants (name, slug, plan_type, subscription_status)
VALUES ('Demo Auto Detail', 'demo-auto-detail', 'solo', 'active');

-- Note: Additional seed data will be added after you create a test user in Supabase Auth
