# TrustEngine
## AI-Accelerated Reputation Management Platform

> **Status:** MVP Launch-Ready  
> **Last Updated:** August 10, 2026  
> **Developer:** THE PRO ONE  
> **Workspace:** `C:\Users\THE PRO ONE\TrustEngine`  
> **Supabase Project:** `glpemdsqzcawrlnryppn`  

---

## What Is TrustEngine?

TrustEngine is a **reputation management and customer feedback platform** for small-to-medium businesses. It turns every customer interaction into a review opportunity through AI-powered QR codes.

### Core Features
- **QR Code Generation** — Create branded QR codes that customers scan to leave feedback
- **Real-Time Feedback Inbox** — Collect ratings, comments, and customer details instantly
- **Team Management** — Invite staff with role-based access (Owner, Admin, Staff)
- **Business Settings** — Configure branding, colors, business name, and slug
- **Payment Integration** — Stripe-powered subscription tiers
- **SMS & Email Alerts** — Twilio and Resend notifications for new feedback

---

## Quick Start

### Prerequisites
- Windows 10+
- Node.js 18+
- PowerShell or Command Prompt
- Supabase CLI (`npx supabase`)

### Start Development Server
```powershell
cd "C:\Users\THE PRO ONE\TrustEngine\apps\web"
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
npm run dev
```
Server starts at `http://localhost:3000`

### Deploy All Edge Functions
```powershell
cd "C:\Users\THE PRO ONE\TrustEngine"
npx supabase functions deploy create-qr-session submit-feedback validate-qr-session get-feedback send-sms-alert invite-staff create-checkout-session stripe-webhook send-email
```

### Set Secrets (Replace with real values)
```powershell
npx supabase secrets set STRIPE_SECRET_KEY="sk_live_YOUR_KEY"
npx supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_YOUR_SECRET"
npx supabase secrets set TWILIO_ACCOUNT_SID="AC_YOUR_SID"
npx supabase secrets set TWILIO_AUTH_TOKEN="YOUR_TOKEN"
npx supabase secrets set TWILIO_PHONE_NUMBER="+15551234567"
npx supabase secrets set RESEND_API_KEY="re_YOUR_KEY"
npx supabase secrets set RESEND_FROM_EMAIL="you@yourdomain.com"
```

---

## Project Structure

```
TrustEngine/
├── apps/
│   └── web/                          # Next.js 15 frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── dashboard/        # Dashboard pages
│       │   │   │   ├── page.tsx      # Dashboard home
│       │   │   │   ├── qr/           # QR code generation
│       │   │   │   ├── inbox/        # Feedback inbox
│       │   │   │   ├── team/         # Team management
│       │   │   │   └── settings/     # Business settings
│       │   │   └── ...
│       │   └── ...
│       ├── next.config.ts            # ⚠️ CRITICAL: Keep stable
│       └── .env.local                # Frontend env vars
├── supabase/
│   └── functions/                    # 9 Edge Functions
│       ├── create-qr-session/
│       ├── submit-feedback/
│       ├── validate-qr-session/
│       ├── get-feedback/
│       ├── send-sms-alert/
│       ├── invite-staff/
│       ├── create-checkout-session/
│       ├── stripe-webhook/
│       └── send-email/
└── ...
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15.5.23, TypeScript, Tailwind CSS |
| Backend | Supabase Edge Functions (Deno) |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth (JWT) |
| Payments | Stripe |
| SMS | Twilio |
| Email | Resend |
| Hosting | Supabase (backend), Vercel (frontend — pending) |

---

## Development Philosophy

> **"Launch the MVP. Harden with real feedback."**

This project was built using an AI-native development workflow:
1. **Describe** the problem in plain English
2. **AI analyzes** logs, structure, and responses
3. **AI generates** exact fixes — code, SQL, or commands
4. **Cursor/Claude executes** hands-free across files
5. **AI verifies** and moves to the next blocker

**Result:** A working reputation platform built in ~48 hours instead of weeks.

---

## Current Status

| Feature | Status |
|---------|--------|
| Dev Server | ✅ Stable |
| Authentication | ✅ Working |
| QR Code Generation | ✅ Generates valid JWTs |
| Feedback Submission | ✅ Functional |
| Feedback Inbox | ✅ Loads submissions |
| Team Page | ✅ No 404 |
| Settings Page | ✅ Saves correctly |
| All 9 Edge Functions | ✅ Deployed |
| Database RLS | ✅ Active |
| Stripe Payments | ⚠️ Placeholder secrets |
| Twilio SMS | ⚠️ Secrets not set |
| Resend Email | ⚠️ Secrets not set |
| Public URL | ❌ Still localhost |

**MVP Ready:** 95% (core loop works, payment/comm integrations need real keys)

---

## Known Issues & Fixes

### Critical: next.config.ts Restart Loop
**Problem:** Server enters infinite restart loop, 80s compile times  
**Fix:** Ensure `next.config.ts` contains ONLY:
```typescript
// @ts-nocheck
import type { NextConfig } from 'next';
const nextConfig: NextConfig = { typedRoutes: true };
export default nextConfig;
```
**Never wrap in `experimental: { }`**

### 406 Error on Settings Page
**Problem:** Settings frozen, keyboard dead  
**Fix:** Run RLS SQL in Supabase SQL Editor (see `DATABASE_SCHEMA.md`)

### PowerShell vs CMD
**Problem:** `rmdir /s /q` fails in PowerShell  
**Fix:** Use `Remove-Item .next -Recurse -Force`

---

## Next Steps

1. **Test Core Loop:** QR → Submit → Inbox (2 minutes)
2. **Add Real Secrets:** Stripe, Twilio, Resend (5 minutes)
3. **Deploy to Vercel:** Public URL (5 minutes)
4. **Invite Beta Users:** Get real feedback
5. **Sprint 1:** Security hardening, UI polish

---

## Documentation Suite

| Document | Purpose |
|----------|---------|
| `MASTER_README.md` | This file — project overview |
| `TECHNICAL_ARCHITECTURE.md` | Deep dive into architecture |
| `DEPLOYMENT_GUIDE.md` | Step-by-step deploy instructions |
| `TROUBLESHOOTING.md` | Common issues and solutions |
| `API_REFERENCE.md` | Edge Function API docs |
| `DATABASE_SCHEMA.md` | Tables, RLS, and SQL |
| `CURSOR_AGENT_BRIEF.md` | Ready-to-paste Cursor brief |
| `ENVIRONMENT_SETUP.md` | Env vars and secrets guide |

---

*Built with AI assistance from Kimi (Moonshot AI), Cursor Agent, and Claude Code.*  
*August 2026*
