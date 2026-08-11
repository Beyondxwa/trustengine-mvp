# Localhost Audit

Generated: 2026-08-10 21:14 (UTC-7)
Pattern: `localhost:` (case-insensitive)
Scope: `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.md`, `.env*` (excluding `node_modules`, `.next`, `dist`, `.git`)

## Snapshot after production-critical replacements

### Production-critical runtime (verified CLEAN of localhost:)

- `supabase/functions/create-qr-session/index.ts` — QR URL now `https://TRUSTENGINE_PROD_URL/...`
- `supabase/functions/update-qr-session/index.ts` — no site URL / no localhost
- `supabase/functions/invite-staff/index.ts` — invite URL now `https://TRUSTENGINE_PROD_URL/...`
- `supabase/functions/create-checkout-session/index.ts` — Stripe success/cancel now `https://TRUSTENGINE_PROD_URL/...`
- `packages/shared/src/constants.ts` — APP_URL / ADMIN_URL defaults now `https://TRUSTENGINE_PROD_URL`
- `packages/shared/src/env.ts` — APP_URL / ADMIN_URL defaults now `https://TRUSTENGINE_PROD_URL`
- `apps/web/src/app/dashboard/qr/page.tsx` — already clean (uses env)
- `apps/web/src/app/(review)/[tenantSlug]/review/page.tsx` — already clean
- `apps/web/src/lib/utils.ts` — already clean

### Pre-replacement hits (for history)

```
supabase/functions/create-qr-session/index.ts
  Line 129: const qrUrl = `http://localhost:3000/${tenantSlug}/review?token=${token}`;

supabase/functions/invite-staff/index.ts
  Line 173: invite_url: `http://localhost:3005/invite?token=${invite.token}`,

supabase/functions/create-checkout-session/index.ts
  Line 135: success_url: success_url || "http://localhost:3005/billing/success?session_id={CHECKOUT_SESSION_ID}",
  Line 136: cancel_url: cancel_url || "http://localhost:3005/billing/cancel",

packages/shared/src/constants.ts
  Line 5: export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3005';
  Line 6: export const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3005';

packages/shared/src/env.ts
  Line 37: APP_URL: z.string().url().default('http://localhost:3005'),
  Line 38: ADMIN_URL: z.string().url().default('http://localhost:3005'),
```

### Remaining localhost references (intentionally NOT replaced)

```
C:\Users\THE PRO ONE\TrustEngine\apps\mobile\.env
  Line 4: EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
  Line 6: EXPO_PUBLIC_APP_URL=http://localhost:3000

C:\Users\THE PRO ONE\TrustEngine\apps\admin\.env.local.example
  Line 4: NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
  Line 8: NEXT_PUBLIC_APP_URL=http://localhost:3001

C:\Users\THE PRO ONE\TrustEngine\apps\web\.env.local.example
  Line 4: NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
  Line 8: NEXT_PUBLIC_APP_URL=http://localhost:3000

C:\Users\THE PRO ONE\TrustEngine\Project-bible\TrustEngine_Project_Chronicle.md
  Line 53: - **Dev Server:** `localhost:3000` ...
  Line 229: | Public URL | Still on `localhost:3000` — needs Vercel deploy |
  Line 304: 3. **Port conflicts happen.** `localhost:3000` vs `3001` ...

C:\Users\THE PRO ONE\TrustEngine\Project-bible\TrustEngine_TROUBLESHOOTING.md
  Line 261: curl ... http://localhost:3000

C:\Users\THE PRO ONE\TrustEngine\Project-bible\TrustEngine_DEPLOYMENT_GUIDE.md
  Lines 59, 64, 273, 278-282: local verify URLs on localhost:3000

C:\Users\THE PRO ONE\TrustEngine\Project-bible\TrustEngine_MASTER_README.md
  Line 40: Server starts at `http://localhost:3000`

C:\Users\THE PRO ONE\TrustEngine\TESTING_PROTOCOL.md
  Lines 13, 19, 26, 32, 41: local test URLs on localhost:3000

C:\Users\THE PRO ONE\TrustEngine\MASTER_CURSOR_CLAUDE_BRIEF.md
  Line 20: Runs at: http://localhost:3000 (fallback 3001)
```

### Notes

- `.env` / `.env.example` files left unchanged per checklist rules.
- Docs / troubleshooting left unchanged (not end-user QR/API runtime).
- `apps/mobile/app.json` `com.trustengine.app` is a bundle ID, not a URL — left unchanged.
