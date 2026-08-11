# TrustEngine — Troubleshooting Guide

> **Last Updated:** August 10, 2026  
> **For:** Windows PowerShell / CMD / Cursor Agent

---

## Quick Diagnosis Table

| Symptom | Likely Cause | Fix | Time |
|---------|-------------|-----|------|
| Server restarts every 2-3 min | `next.config.ts` has `experimental:` wrapper | Flatten to `typedRoutes: true` | 2 min |
| Pages take 80+ seconds to load | `.next` cache corrupted + restart loop | Stop server, delete `.next`, restart | 3 min |
| `rmdir /s /q` fails | Using CMD syntax in PowerShell | Use `Remove-Item .next -Recurse -Force` | 1 min |
| Settings page frozen, keyboard dead | Missing RLS policy on `tenants` table | Run RLS SQL in Supabase | 2 min |
| "Failed to fetch feedback" in inbox | `get-feedback` function missing or wrong table | Create/deploy `get-feedback`, align tables | 5 min |
| `/dashboard/team` shows 404 | Page file doesn't exist | Create `team/page.tsx` | 3 min |
| 401 on Edge Function calls | Wrong or missing auth token | Check `Authorization: Bearer` header | 1 min |
| 406 on database reads | RLS not enabled or no policy | Enable RLS, create policies | 2 min |
| `findstr` exit code 1 | Port check found nothing (port is free) | Ignore — not an error | 0 min |
| Cursor agent times out | Server restart loop + too many tasks | Fix server first, then run smaller tasks | 5 min |
| Invite email not sending | Missing `RESEND_API_KEY` secret | Set real Resend API key | 2 min |
| SMS not sending | Missing `TWILIO_*` secrets | Set real Twilio credentials | 2 min |
| Stripe checkout fails | Placeholder `sk_live_...` secret | Replace with real Stripe key | 2 min |

---

## Critical Issues

### 1. Infinite Restart Loop (HIGHEST PRIORITY)

**Symptoms:**
- Console shows: `Found a change in next.config.ts. Restarting...`
- Compile times: 60-155 seconds per page
- Server never stabilizes
- CPU at 100%

**Root Cause:**
`next.config.ts` contains:
```typescript
experimental: {
  typedRoutes: true
}
```
Next.js 15 treats this as a config change on every compile, triggering restart.

**Fix:**
1. Stop server: `Ctrl + C`
2. Open `apps/web/next.config.ts`
3. Replace ENTIRE file with:
```typescript
// @ts-nocheck
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
};

export default nextConfig;
```
4. Save. Close file. Do NOT reopen.
5. Clear cache:
```powershell
cd "C:\Users\THE PRO ONE\TrustEngine\apps\web"
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
```
6. Restart:
```powershell
npm run dev
```
7. Watch for 3 minutes. Should NOT see restart message.

**Prevention:**
- Never let Cursor auto-format `next.config.ts`
- Add `// @ts-nocheck` at top to prevent type-checker rewrites
- Close the file in editor after saving

---

### 2. Settings Page 406 Error

**Symptoms:**
- Settings loads but form is frozen
- Keyboard doesn't work in input fields
- Color pickers don't respond
- Console shows: `Failed to load resource: 406`

**Root Cause:**
No RLS policy allows the authenticated user to read/update their tenant data.

**Fix:**
Run in Supabase SQL Editor:
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

Then hard refresh browser: `Ctrl + Shift + R`

---

### 3. Feedback Inbox "Failed to Fetch"

**Symptoms:**
- Inbox page loads but shows error message
- QR submissions work (customer can submit)
- But submissions don't appear in inbox

**Root Cause A:** `get-feedback` Edge Function doesn't exist.
**Fix:** Create and deploy it.

**Root Cause B:** Table mismatch.
- `submit-feedback` writes to `feedback_submissions`
- `get-feedback` reads from `feedback` (wrong table)

**Fix:** Align both to `feedback_submissions`:
1. Check `submit-feedback/index.ts` — ensure it INSERTS into `feedback_submissions`
2. Check `get-feedback/index.ts` — ensure it SELECTS from `feedback_submissions`
3. Redeploy both functions

**Verify:**
```powershell
# Create test QR session
# Submit test feedback
# Check inbox — should appear
```

---

### 4. PowerShell Command Failures

**Symptom:** `rmdir /s /q .next` fails with:
```
Remove-Item : A positional parameter cannot be found that accepts argument '/q'
```

**Root Cause:** Mixing CMD syntax with PowerShell.

**PowerShell Commands:**
```powershell
# Delete folder
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue

# Check port
Get-NetTCPConnection -LocalPort 3000

# Kill process by port
$proc = Get-NetTCPConnection -LocalPort 3000 | Select-Object -First 1
Stop-Process -Id $proc.OwningProcess -Force
```

**CMD Commands (if using cmd.exe):**
```cmd
rmdir /s /q .next
```

**Rule:** Know which shell you're in. PowerShell = blue window. CMD = black window.

---

### 5. Cursor Agent Timeout

**Symptom:**
```
subagent status: error
detail: [unavailable] PING timed out
```

**Root Cause:** Agent tried to do too many things while server was unstable.

**Fix:**
1. Fix the server restart loop FIRST (see Issue #1)
2. Break work into smaller tasks
3. Run tasks manually if agent keeps timing out

**Better Approach:**
Instead of one giant brief, use smaller prompts:
```
"Create the get-feedback Edge Function at supabase/functions/get-feedback/index.ts"
```
Then:
```
"Deploy the get-feedback function"
```
Then:
```
"Create the /dashboard/team page at apps/web/src/app/dashboard/team/page.tsx"
```

---

### 6. Edge Function 401 Unauthorized

**Symptom:** API calls return 401.

**Causes & Fixes:**

**A. Missing or wrong token:**
```powershell
# Wrong
$headers = @{"Authorization"="Bearer"}

# Right
$headers = @{"Authorization"="Bearer eyJ..."}
```

**B. Token expired:**
- Re-authenticate in the app
- Or generate a new anon key from Supabase dashboard

**C. Function requires auth but called without:**
- `create-qr-session`, `get-feedback`, `invite-staff` require Bearer token
- `submit-feedback`, `validate-qr-session` are public (no auth needed)

---

### 7. Placeholder Secrets Not Working

**Symptom:**
- Stripe checkout redirects to error
- SMS never sends
- Emails bounce

**Root Cause:** Secrets were set as placeholders:
```powershell
npx supabase secrets set STRIPE_SECRET_KEY="sk_live_..."
```
The literal string `"sk_live_..."` was saved, not a real key.

**Fix:**
1. Get real API keys from respective dashboards
2. Re-set secrets with actual values:
```powershell
npx supabase secrets set STRIPE_SECRET_KEY="sk_live_actualkeyhere"
```

---

## Diagnostic Commands

### Check Server Status
```powershell
# Is Next.js running?
Get-Process -Name "node" | Select-Object Id, CPU, WorkingSet

# What's on port 3000?
Get-NetTCPConnection -LocalPort 3000

# Test localhost
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### Check Supabase Functions
```powershell
npx supabase functions list
```

### Check Secrets
```powershell
npx supabase secrets list
# Shows names only, not values (security)
```

### Test Database Connection
```sql
-- In Supabase SQL Editor
SELECT COUNT(*) FROM tenants;
SELECT COUNT(*) FROM feedback_submissions;
SELECT COUNT(*) FROM user_tenants;
```

### Check Browser Console
1. Open app in browser
2. Press `F12` → Console tab
3. Look for red errors
4. Network tab → check for 4xx/5xx responses

---

## Recovery Procedures

### Nuclear Option: Full Reset
If everything is broken:
```powershell
# 1. Stop everything
# Close all PowerShell, CMD, browser tabs

# 2. Delete all caches
cd "C:\Users\THE PRO ONE\TrustEngine\apps\web"
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue

# 3. Reinstall
cd "C:\Users\THE PRO ONE\TrustEngine"
npm install

# 4. Fix config (one more time)
# Ensure next.config.ts is correct

# 5. Start fresh
cd apps/web
npm run dev
```

### Database Reset (CAREFUL)
```sql
-- Only if you need to start over
TRUNCATE TABLE feedback_submissions CASCADE;
TRUNCATE TABLE qr_sessions CASCADE;
-- DO NOT truncate tenants or user_tenants unless you mean it
```

---

## Getting Help

### What to Include in a Support Request
1. **Exact error message** (copy-paste, don't paraphrase)
2. **What you were doing** when it broke
3. **Browser console output** (F12 → Console)
4. **PowerShell output** (last 20 lines)
5. **Server status** (is it running? restarting?)

### Quick Self-Help Checklist
- [ ] Server stable? (no restart loop)
- [ ] `.next` cache cleared?
- [ ] `next.config.ts` correct?
- [ ] All Edge Functions deployed?
- [ ] RLS policies active?
- [ ] Secrets set (not placeholders)?
- [ ] Browser hard-refreshed? (Ctrl+Shift+R)

---

*Document generated from AI-assisted development logs*  
*August 10, 2026*
