# TRUSTENGINE — HANDS-FREE LAUNCH BRIEF
## For Cursor Agent / Claude Code
## Project: TrustEngine | User: info@beyondx.llc | Goal: LAUNCH TODAY

---

## PROJECT LOCATION
```
C:\Users\THE PRO ONE\TrustEngine
```

## SUPABASE PROJECT
```
URL: https://glpemdsqzcawrlnryppn.supabase.co
Project Ref: glpemdsqzcawrlnryppn
```

## DEV SERVER
```
Runs at: http://localhost:3000 (fallback 3001)
Next.js 15.5.23
```

## CURRENT STATE (AS OF NOW)
- [x] Dev server running
- [x] User can log in (info@beyondx.llc)
- [x] QR Code generation WORKS — generates valid JWT, countdown timer works, copy button works
- [?] Feedback Inbox — UNTESTED (may still show "Failed to fetch feedback")
- [x] Settings page loads
- [ ] /dashboard/team — 404 (page missing)
- [ ] All Edge Functions deployed
- [ ] All Supabase Secrets set

---

## YOUR MISSION (DO IN ORDER)

### PHASE 1: VERIFY & FIX (10 min)
1. Read the actual file tree of the project
2. Check if `supabase/functions/get-feedback/index.ts` exists
3. Check if `supabase/functions/create-qr-session/index.ts` is clean (no "functions is not defined" garbage)
4. Check Supabase Dashboard Secrets — list which ones exist vs missing
5. Check database: does `qr_sessions` table exist with correct schema? Does `feedback` table exist?

### PHASE 2: FIX FEEDBACK INBOX (5 min)
If `get-feedback` function is missing or broken:
- Create/replace `supabase/functions/get-feedback/index.ts` with clean code
- Deploy: `npx supabase functions deploy get-feedback`

The function code:
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const accessToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: membership } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ success: false, error: "No tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let filters: any = {};
    try { filters = await req.json(); } catch {}
    let query = supabase.from("feedback").select("*").eq("tenant_id", membership.tenant_id)
      .order("created_at", { ascending: false }).limit(100);
    if (filters.rating) query = query.eq("rating", filters.rating);
    if (filters.status === "resolved") query = query.eq("is_resolved", true);
    if (filters.status === "unresolved") query = query.eq("is_resolved", false);
    if (filters.search) {
      query = query.or(`comment.ilike.%${filters.search}%,customer_email.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return new Response(JSON.stringify({ success: true, data: data || [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("get-feedback error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
```

### PHASE 3: FIX SUBMIT-FEEDBACK (if broken)
Check `supabase/functions/submit-feedback/index.ts`:
- If it has `https://esm.sh/jose@5.2.2/index.ts` → change to `https://esm.sh/jose@5.2.2` (remove `/index.ts`)
- Deploy: `npx supabase functions deploy submit-feedback`

### PHASE 4: CREATE TEAM PAGE (5 min)
The sidebar links to `/dashboard/team` but it 404s.
- Check existing dashboard pages to match the pattern (layout, sidebar, styling)
- Create the team page at the correct path
- It should show: team members table, invite staff button (placeholder), current user info
- Keep it simple — functional but minimal

### PHASE 5: DEPLOY ALL FUNCTIONS (5 min)
Run these deploys. Skip any that fail and report which ones:
```powershell
npx supabase functions deploy create-qr-session
npx supabase functions deploy submit-feedback
npx supabase functions deploy validate-qr-session
npx supabase functions deploy get-feedback
npx supabase functions deploy send-sms-alert
npx supabase functions deploy send-email
npx supabase functions deploy invite-staff
npx supabase functions deploy create-checkout-session
npx supabase functions deploy stripe-webhook
```

### PHASE 6: VERIFY SECRETS (2 min)
Ensure these exist in Supabase Dashboard → Edge Functions → Secrets:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- QR_JWT_SECRET (if missing, generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- ANTHROPIC_API_KEY
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_PHONE_NUMBER
- RESEND_API_KEY
- RESEND_FROM_EMAIL

### PHASE 7: DATABASE SANITY CHECK (3 min)
Run this SQL in Supabase SQL Editor if any table issues remain:
```sql
-- Ensure qr_sessions is clean
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

-- Ensure feedback table exists
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

-- Fix RLS recursion on user_tenants
DROP POLICY IF EXISTS user_tenants_tenant_isolation ON user_tenants;
CREATE POLICY user_tenants_tenant_isolation ON user_tenants FOR ALL USING (user_id = auth.uid());
```

---

## LAUNCH CHECKLIST (VERIFY EACH)
- [ ] Login at /auth/login works
- [ ] /dashboard/qr generates QR code in < 3 seconds
- [ ] /dashboard/inbox loads — shows "No feedback yet" or feedback list (NO crash)
- [ ] /dashboard/settings saves business name and persists after refresh
- [ ] /dashboard/team loads (no 404)
- [ ] All Edge Functions deployed successfully
- [ ] No console errors on any dashboard page

---

## CRITICAL RULES
1. Use Windows PowerShell for all commands
2. Check if files exist BEFORE creating them
3. Do NOT modify working files (dashboard layout, sidebar, auth pages, QR page)
4. If a deploy fails, show the EXACT error message
5. After each fix, verify it works before moving on
6. The user is NOT technical — make everything automatic
7. If something is already working, DO NOT touch it

---

## REPORT BACK FORMAT
When done, reply with EXACTLY this:

```
PHASE 1: [OK / Issues found: ...]
PHASE 2: [OK / Fixed / Skipped]
PHASE 3: [OK / Fixed / Skipped]
PHASE 4: [Created at path: ... / Already existed]
PHASE 5: [All deployed / Failed: list function names]
PHASE 6: [All secrets set / Missing: list names]
PHASE 7: [OK / Ran SQL]

LAUNCH CHECKLIST:
- [ ] Login
- [ ] QR Code
- [ ] Inbox
- [ ] Settings
- [ ] Team
- [ ] All Functions
- [ ] No Console Errors

BLOCKERS (if any): [none / describe]
```
