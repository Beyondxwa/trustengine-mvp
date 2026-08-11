# TrustEngine — Deployment Guide

> **Last Updated:** August 10, 2026  
> **Target:** Windows PowerShell / Command Prompt

---

## Table of Contents
1. [Local Development Setup](#1-local-development-setup)
2. [Database Setup](#2-database-setup)
3. [Edge Function Deployment](#3-edge-function-deployment)
4. [Secrets Configuration](#4-secrets-configuration)
5. [Frontend Build & Test](#5-frontend-build--test)
6. [Production Deploy (Vercel)](#6-production-deploy-vercel)
7. [Post-Deploy Verification](#7-post-deploy-verification)

---

## 1. Local Development Setup

### Prerequisites Checklist
- [ ] Node.js 18+ installed
- [ ] npm or yarn available
- [ ] Supabase CLI installed (`npm install -g supabase`)
- [ ] Git installed
- [ ] Windows PowerShell or CMD

### Step 1: Navigate to Project
```powershell
cd "C:\Users\THE PRO ONE\TrustEngine"
```

### Step 2: Install Dependencies
```powershell
cd apps/web
npm install
cd ../..
```

### Step 3: Configure Environment
Create `apps/web/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://glpemdsqzcawrlnryppn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

> Get your Anon Key from: Supabase Dashboard → Project Settings → API

### Step 4: Start Dev Server
```powershell
cd apps/web
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
npm run dev
```

**Expected output:**
```
▲ Next.js 15.5.23
- Local:   http://localhost:3000
- Network: http://10.0.0.162:3000
✓ Ready in 47s
```

**Verify:** Open `http://localhost:3000` — should show login page.

---

## 2. Database Setup

### Step 1: Open Supabase SQL Editor
1. Go to: https://supabase.com/dashboard/project/glpemdsqzcawrlnryppn
2. Click **SQL Editor** in left sidebar
3. Click **New Query**

### Step 2: Run Schema Setup
Paste and run the following SQL:

```sql
-- ============================================
-- TRUSTENGINE DATABASE SETUP
-- ============================================

-- Tenants table
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

-- User-Tenant memberships
CREATE TABLE IF NOT EXISTS user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

-- Feedback submissions
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

-- QR Sessions
CREATE TABLE IF NOT EXISTS qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
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

-- User Tenants RLS
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_tenants_self_read ON user_tenants;
CREATE POLICY user_tenants_self_read ON user_tenants
  FOR SELECT USING (user_id = auth.uid());
```

### Step 3: Verify Tables
Run in SQL Editor:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```
Should return: `tenants`, `user_tenants`, `feedback_submissions`, `qr_sessions`

---

## 3. Edge Function Deployment

### Deploy All Functions
```powershell
cd "C:\Users\THE PRO ONE\TrustEngine"

npx supabase functions deploy create-qr-session
npx supabase functions deploy submit-feedback
npx supabase functions deploy validate-qr-session
npx supabase functions deploy get-feedback
npx supabase functions deploy send-sms-alert
npx supabase functions deploy invite-staff
npx supabase functions deploy create-checkout-session
npx supabase functions deploy stripe-webhook
npx supabase functions deploy send-email
```

### Or Deploy All at Once
```powershell
npx supabase functions deploy create-qr-session submit-feedback validate-qr-session get-feedback send-sms-alert invite-staff create-checkout-session stripe-webhook send-email
```

### Verify Deployment
```powershell
npx supabase functions list
```

**Expected:** All 9 functions shown with "Deployed" status.

---

## 4. Secrets Configuration

### Required Secrets

| Secret | Source | Required For |
|--------|--------|-------------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → API Keys | Payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks | Payment events |
| `TWILIO_ACCOUNT_SID` | Twilio Console | SMS alerts |
| `TWILIO_AUTH_TOKEN` | Twilio Console | SMS alerts |
| `TWILIO_PHONE_NUMBER` | Twilio Console → Phone Numbers | SMS sender |
| `RESEND_API_KEY` | Resend Dashboard | Email delivery |
| `RESEND_FROM_EMAIL` | Resend Dashboard → Domains | Email sender |
| `QR_JWT_SECRET` | Generate random string | QR code signing |

### Set Secrets
```powershell
cd "C:\Users\THE PRO ONE\TrustEngine"

# Stripe
npx supabase secrets set STRIPE_SECRET_KEY="sk_live_YOUR_KEY"
npx supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_YOUR_SECRET"

# Twilio
npx supabase secrets set TWILIO_ACCOUNT_SID="AC_YOUR_SID"
npx supabase secrets set TWILIO_AUTH_TOKEN="YOUR_TOKEN"
npx supabase secrets set TWILIO_PHONE_NUMBER="+15551234567"

# Resend
npx supabase secrets set RESEND_API_KEY="re_YOUR_KEY"
npx supabase secrets set RESEND_FROM_EMAIL="you@yourdomain.com"

# QR JWT (generate a strong random string)
npx supabase secrets set QR_JWT_SECRET="your-random-256-bit-secret-here"
```

### Verify Secrets
```powershell
npx supabase secrets list
```

---

## 5. Frontend Build & Test

### Build for Production
```powershell
cd "C:\Users\THE PRO ONE\TrustEngine\apps\web"
npm run build
```

**Expected:** `✓ Compiled successfully` with no TypeScript errors.

### Run Smoke Tests
```powershell
# Test dev server responds
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Expected: 200
```

### Manual Test Checklist
- [ ] `http://localhost:3000` — Login page loads
- [ ] `http://localhost:3000/dashboard/qr` — Generate QR code
- [ ] `http://localhost:3000/dashboard/inbox` — Loads without error
- [ ] `http://localhost:3000/dashboard/team` — No 404
- [ ] `http://localhost:3000/dashboard/settings` — Form works, saves data

---

## 6. Production Deploy (Vercel)

### Step 1: Push to GitHub
```powershell
cd "C:\Users\THE PRO ONE\TrustEngine"
git init
git add .
git commit -m "TrustEngine MVP ready for deploy"
git remote add origin https://github.com/YOUR_USERNAME/trustengine.git
git push -u origin main
```

### Step 2: Deploy on Vercel
1. Go to https://vercel.com
2. Click **Add New Project**
3. Import your GitHub repo
4. Configure:
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/web`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`

### Step 3: Add Environment Variables
In Vercel project settings, add:
```
NEXT_PUBLIC_SUPABASE_URL=https://glpemdsqzcawrlnryppn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Step 4: Deploy
Click **Deploy**. Vercel builds and provides a public URL.

### Alternative: Use ngrok for Quick Public URL
```powershell
npx ngrok http 3000
```
Copy the `https://xxxx.ngrok.io` URL and share it.

---

## 7. Post-Deploy Verification

### API Health Check
```powershell
$URL = "https://glpemdsqzcawrlnryppn.supabase.co/functions/v1"

# Test each function
Invoke-RestMethod -Uri "$URL/create-qr-session" -Method POST -Headers @{"Authorization"="Bearer YOUR_ANON_KEY"} -Body '{"tenant_id":"YOUR_TENANT_ID"}'

Invoke-RestMethod -Uri "$URL/get-feedback" -Method POST -Headers @{"Authorization"="Bearer YOUR_ANON_KEY"} -Body '{"tenant_id":"YOUR_TENANT_ID"}'
```

### End-to-End Test
1. Log in to production app
2. Generate a QR code
3. Scan with phone
4. Submit 5-star feedback
5. Check inbox — feedback should appear

### Stripe Webhook Setup (if using payments)
1. Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://glpemdsqzcawrlnryppn.supabase.co/functions/v1/stripe-webhook`
3. Select events: `checkout.session.completed`
4. Copy signing secret → set as `STRIPE_WEBHOOK_SECRET`

---

## Rollback Plan

If deployment fails:
```powershell
# Rollback Edge Function
npx supabase functions deploy create-qr-session --legacy

# Or redeploy previous version from git
git log --oneline
git checkout PREVIOUS_COMMIT
npx supabase functions deploy
```

---

*Document generated from AI-assisted development logs*  
*August 10, 2026*
