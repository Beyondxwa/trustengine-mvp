# TrustEngine — LAUNCH TESTING PROTOCOL
# Follow this EXACTLY after Cursor/Claude finishes

## PRE-TEST CHECKLIST
- [ ] Dev server is running (PowerShell shows "Ready")
- [ ] All Edge Functions deployed (run deploy-all.ps1)
- [ ] Supabase Secrets are set
- [ ] Browser: Chrome or Edge (not IE)

---

## TEST 1: LOGIN (30 seconds)
1. Open: http://localhost:3000/auth/login
2. Sign in with: info@beyondx.llc
3. Expected: Redirected to /dashboard
4. Result: [ ] PASS  [ ] FAIL → If fail, check browser console (F12 → Console)

## TEST 2: QR CODE (30 seconds)
1. Go to: http://localhost:3000/dashboard/qr
2. Click "Generate QR Code"
3. Expected: QR SVG appears within 3 seconds, countdown timer starts
4. Click "Copy" — link should copy to clipboard
5. Result: [ ] PASS  [ ] FAIL

## TEST 3: FEEDBACK INBOX (30 seconds)
1. Go to: http://localhost:3000/dashboard/inbox
2. Expected: Page loads, shows "No feedback yet" OR a list of feedback
3. NO red error banners, NO "Failed to fetch feedback"
4. Result: [ ] PASS  [ ] FAIL

## TEST 4: SETTINGS (1 minute)
1. Go to: http://localhost:3000/dashboard/settings
2. Change Business Name to "Beyond X Test"
3. Click Save
4. Refresh the page (F5)
5. Expected: Name "Beyond X Test" persists
6. Change it back to "Beyond X LLC"
7. Result: [ ] PASS  [ ] FAIL

## TEST 5: TEAM PAGE (30 seconds)
1. Go to: http://localhost:3000/dashboard/team
2. Expected: Page loads (no 404), shows team members or "No team members yet"
3. Result: [ ] PASS  [ ] FAIL

## TEST 6: CONSOLE ERRORS (1 minute)
1. Open browser DevTools (F12 → Console)
2. Visit each page: /dashboard, /dashboard/qr, /dashboard/inbox, /dashboard/settings, /dashboard/team
3. Expected: NO red errors on any page (yellow warnings are OK)
4. Result: [ ] PASS  [ ] FAIL

---

## SCORING
- 6/6 PASS = 🚀 READY TO LAUNCH
- 5/6 PASS = Minor issue, fix and retest
- 4/6 or below = Blocker, go back to Cursor/Claude

## IF ANY TEST FAILS
1. Note the EXACT error message
2. Open browser DevTools (F12) → Console → copy red errors
3. Go back to Cursor/Claude, paste the error, say "Fix this"
4. Do NOT try to fix manually

---

## POST-LAUNCH (After all tests pass)
1. Commit code: `git add . && git commit -m "launch ready"`
2. Push to production branch
3. Deploy to Vercel/Netlify
4. Update DNS to point to production
5. Send launch announcement
