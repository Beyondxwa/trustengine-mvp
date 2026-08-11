# TrustEngine — Cursor Agent Brief

> **Purpose:** Paste this ENTIRE document into Cursor Agent (Ctrl+I → Agent mode)  
> **Expected Time:** 20-30 minutes hands-free execution  
> **Last Updated:** August 10, 2026

---

## AGENT INSTRUCTION

You are a senior full-stack engineer working on TrustEngine, a reputation management platform. Execute ALL tasks below in order. Do NOT ask the user for confirmation unless you hit a blocker you cannot solve. Read files, make changes, deploy, and report results.

**Workspace:** `C:\Users\THE PRO ONE\TrustEngine`  
**Supabase Project:** `glpemdsqzcawrlnryppn`  
**Supabase URL:** `https://glpemdsqzcawrlnryppn.supabase.co`  
**Use Windows PowerShell for all commands.**

---

## PHASE 1: VERIFY PROJECT STATE

1. Read `apps/web/next.config.ts` — confirm it contains ONLY:
   ```typescript
   // @ts-nocheck
   import type { NextConfig } from 'next';
   const nextConfig: NextConfig = { typedRoutes: true };
   export default nextConfig;
   ```
   If it has `experimental:` wrapper, fix it immediately.

2. Check if dev server is running on port 3000 or 3001:
   ```powershell
   Get-NetTCPConnection -LocalPort 3000,3001 -ErrorAction SilentlyContinue
   ```

3. List deployed Edge Functions:
   ```powershell
   npx supabase functions list
   ```

Report: Server status, port in use, functions deployed.

---

## PHASE 2: RECONCILE FEEDBACK TABLES (CRITICAL)

**Goal:** Ensure QR submissions appear in the inbox.

1. Read `supabase/functions/submit-feedback/index.ts` — note which table it INSERTS into.
2. Read `supabase/functions/get-feedback/index.ts` — note which table it SELECTS from.
3. Read `apps/web/src/app/dashboard/inbox/page.tsx` (or equivalent path) — note the API call shape.

**If tables mismatch:**
- Option A: Change `get-feedback` to read from the same table `submit-feedback` writes to.
- Option B: Change `submit-feedback` to also write to `feedback_submissions`.
- Pick the MINIMAL fix. Align both functions to the SAME table.

**If `get-feedback` doesn't exist:**
- Create it at `supabase/functions/get-feedback/index.ts`
- It should:
  - Accept POST with `{ tenant_id, limit?, offset?, sort_by?, sort_order? }`
  - Validate auth via `supabase.auth.getUser(token)`
  - Query the feedback table with RLS
  - Return `{ success: true, data: [], total: 0, hasMore: false }`

4. Deploy changed functions:
   ```powershell
   npx supabase functions deploy submit-feedback get-feedback
   ```

---

## PHASE 3: CREATE send-email IF MISSING

1. Check if `supabase/functions/send-email/index.ts` exists.
2. If NOT, create it:
   - Read sibling functions for structure/patterns
   - Use Resend API for email delivery
   - Accept `{ to, subject, html, text }`
   - Read `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from Deno.env
   - Return `{ success: true, id }` or error
3. Deploy:
   ```powershell
   npx supabase functions deploy send-email
   ```

---

## PHASE 4: VERIFY DATABASE RLS

1. Connect to Supabase SQL Editor (via API or instruct user).
2. Run verification:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
   ```
3. If `tenants` has `rowsecurity = false`, run:
   ```sql
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
   ```

---

## PHASE 5: VERIFY TEAM PAGE

1. Check if `apps/web/src/app/dashboard/team/page.tsx` exists (or `apps/web/app/dashboard/team/page.tsx`).
2. If missing, create a basic team management page:
   - Show current team members
   - Form to invite new staff (email + role)
   - Call `invite-staff` Edge Function
   - Show pending invites
3. Keep styling consistent with other dashboard pages.

---

## PHASE 6: CHECK SECRETS

1. Read `apps/web/.env.local` and `apps/mobile/.env` (if exists) for API keys.
2. Check what secrets are already set:
   ```powershell
   npx supabase secrets list
   ```
3. If real keys are found in .env files, set them:
   ```powershell
   npx supabase secrets set STRIPE_SECRET_KEY="sk_live_..."
   npx supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_..."
   npx supabase secrets set TWILIO_ACCOUNT_SID="AC_..."
   npx supabase secrets set TWILIO_AUTH_TOKEN="..."
   npx supabase secrets set TWILIO_PHONE_NUMBER="+1..."
   npx supabase secrets set RESEND_API_KEY="re_..."
   npx supabase secrets set RESEND_FROM_EMAIL="..."
   ```
   If only placeholders exist, SKIP — do NOT invent keys.

---

## PHASE 7: FINAL VERIFICATION

1. If dev server is NOT running, start it:
   ```powershell
   cd apps/web
   Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
   npm run dev
   ```
   Wait for `Ready in Xs`.

2. Watch for 3 minutes. Confirm NO restart loop (no "Found a change in next.config.ts").

3. Report EXACTLY:

```
PHASE_FOLLOWUP:
- Feedback table reconcile: [what you did]
- send-email: [Created+deployed / Already existed / Skipped]
- RLS policies: [Verified OK / Fixed / Could not verify]
- Team page: [Existed / Created / Could not create]
- Secrets: [Set from local env: ... / Still missing: ...]
- Dev server: [Stable on port X / Restart loop / Not started]

BLOCKERS REMAINING: [list or "None"]
VERIFY: [Brief note on whether inbox should now show submissions]
```

---

## CONSTRAINTS

- **DO NOT** modify `dashboard/layout.tsx`, `sidebar`, auth pages, or QR page unless required for inbox API shape fix only.
- **DO NOT** invent API keys or secrets.
- **DO NOT** wrap `typedRoutes` in `experimental:`.
- **DO NOT** delete existing working code.
- **Prefer** minimal changes over refactors.
- **Use** `// @ts-nocheck` at top of `next.config.ts` if modifying it.

---

## TROUBLESHOOTING FOR AGENT

### If server restart loop occurs:
- Stop server (Ctrl+C)
- Fix `next.config.ts` (flatten `typedRoutes`)
- Delete `.next` cache: `Remove-Item .next -Recurse -Force`
- Restart

### If deploy fails:
- Check function syntax with `deno check`
- Ensure all imports use correct Supabase Deno imports
- Read sibling functions for correct patterns

### If 406 errors persist:
- RLS is the issue. Ensure ALL tables have RLS enabled AND policies created.

---

*Paste this entire document into Cursor Agent. Hit Submit. Let it cook.*  
*August 10, 2026*
