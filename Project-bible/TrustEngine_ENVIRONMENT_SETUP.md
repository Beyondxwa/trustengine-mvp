# TrustEngine — Environment Setup Guide

> **Last Updated:** August 10, 2026  
> **For:** Windows PowerShell

---

## Files Overview

| File | Location | Purpose |
|------|----------|---------|
| `.env.local` | `apps/web/.env.local` | Frontend environment variables |
| `.env` | `apps/mobile/.env` | Mobile app variables (if applicable) |
| `supabase/.env` | `supabase/.env` | Local Supabase CLI config |
| Supabase Secrets | Cloud (encrypted) | Edge Function runtime secrets |

---

## Frontend Environment Variables

### `apps/web/.env.local`

```env
# Supabase Connection
NEXT_PUBLIC_SUPABASE_URL=https://glpemdsqzcawrlnryppn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# Optional: Analytics, Sentry, etc.
# NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

**How to get values:**
1. Go to: https://supabase.com/dashboard/project/glpemdsqzcawrlnryppn/settings/api
2. Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
3. Copy **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Important:**
- `NEXT_PUBLIC_` prefix makes variables available in browser
- Never put private keys here (Stripe secret, Twilio auth, etc.)
- This file is `.gitignore`d by default

---

## Supabase Edge Function Secrets

These are encrypted and injected into Edge Functions at runtime.

### How to Set

```powershell
cd "C:\Users\THE PRO ONE\TrustEngine"

# Stripe
npx supabase secrets set STRIPE_SECRET_KEY="sk_live_YOUR_ACTUAL_KEY"
npx supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_YOUR_ACTUAL_SECRET"

# Twilio
npx supabase secrets set TWILIO_ACCOUNT_SID="AC_YOUR_ACTUAL_SID"
npx supabase secrets set TWILIO_AUTH_TOKEN="YOUR_ACTUAL_TOKEN"
npx supabase secrets set TWILIO_PHONE_NUMBER="+15551234567"

# Resend
npx supabase secrets set RESEND_API_KEY="re_YOUR_ACTUAL_KEY"
npx supabase secrets set RESEND_FROM_EMAIL="you@yourdomain.com"

# QR JWT (generate a strong random string)
npx supabase secrets set QR_JWT_SECRET="your-256-bit-random-secret-here"
```

### How to Verify

```powershell
npx supabase secrets list
```

Shows names only (values are hidden for security).

### How to Remove

```powershell
npx supabase secrets unset STRIPE_SECRET_KEY
```

---

## Getting Real API Keys

### Stripe
1. Go to: https://dashboard.stripe.com/apikeys
2. Copy **Secret key** (starts with `sk_live_` or `sk_test_`)
3. For webhooks: Developers → Webhooks → Add endpoint → Copy signing secret (starts with `whsec_`)

### Twilio
1. Go to: https://console.twilio.com
2. Account SID starts with `AC_`
3. Auth Token is shown on main console page
4. Phone Number: Buy a number → copy it with `+1` prefix

### Resend
1. Go to: https://resend.com
2. API Keys → Create API Key → copy (starts with `re_`)
3. Domains → Add domain → verify → copy email (e.g., `noreply@yourdomain.com`)

---

## Secret Reference Table

| Secret | Required By | Format | Where to Get |
|--------|-------------|--------|--------------|
| `STRIPE_SECRET_KEY` | `create-checkout-session` | `sk_live_*` or `sk_test_*` | Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | `whsec_*` | Stripe Webhooks |
| `TWILIO_ACCOUNT_SID` | `send-sms-alert` | `AC_*` | Twilio Console |
| `TWILIO_AUTH_TOKEN` | `send-sms-alert` | 32-char hex | Twilio Console |
| `TWILIO_PHONE_NUMBER` | `send-sms-alert` | `+1...` | Twilio Phone Numbers |
| `RESEND_API_KEY` | `send-email`, `invite-staff` | `re_*` | Resend Dashboard |
| `RESEND_FROM_EMAIL` | `send-email`, `invite-staff` | `name@domain.com` | Resend Domains |
| `QR_JWT_SECRET` | `create-qr-session`, `validate-qr-session` | Random string | Generate yourself |

---

## Current Status (August 10, 2026)

| Secret | Status | Notes |
|--------|--------|-------|
| `STRIPE_SECRET_KEY` | ⚠️ Placeholder | Set as `sk_live_...` — needs real key |
| `STRIPE_WEBHOOK_SECRET` | ⚠️ Placeholder | Set as `whsec_...` — needs real key |
| `TWILIO_ACCOUNT_SID` | ❌ Missing | Not set |
| `TWILIO_AUTH_TOKEN` | ❌ Missing | Not set |
| `TWILIO_PHONE_NUMBER` | ❌ Missing | Not set |
| `RESEND_API_KEY` | ❌ Missing | Not set |
| `RESEND_FROM_EMAIL` | ❌ Missing | Not set |
| `QR_JWT_SECRET` | ❓ Unknown | May or may not be set |

**Action Required:** Replace all Stripe placeholders and set remaining secrets before payment/communication features work.

---

## Security Best Practices

1. **Never commit secrets to Git**
   ```powershell
   # Ensure these are in .gitignore
   .env.local
   .env
   supabase/.env
   ```

2. **Use test keys during development**
   - Stripe: `sk_test_*` instead of `sk_live_*`
   - Twilio: Use test credentials
   - Resend: Use sandbox domain

3. **Rotate secrets regularly**
   - Stripe: Regenerate in Dashboard
   - Twilio: Secondary auth tokens
   - Resend: Create new API key, delete old

4. **Monitor secret usage**
   - Stripe: Dashboard → Developers → Events
   - Twilio: Console → Monitor → Logs
   - Resend: Dashboard → Analytics

---

## Quick Setup Script

Run this PowerShell script to set all secrets at once (edit values first):

```powershell
# Save as set-secrets.ps1
# EDIT VALUES BEFORE RUNNING

$secrets = @{
    "STRIPE_SECRET_KEY" = "sk_live_YOUR_KEY"
    "STRIPE_WEBHOOK_SECRET" = "whsec_YOUR_SECRET"
    "TWILIO_ACCOUNT_SID" = "AC_YOUR_SID"
    "TWILIO_AUTH_TOKEN" = "YOUR_TOKEN"
    "TWILIO_PHONE_NUMBER" = "+15551234567"
    "RESEND_API_KEY" = "re_YOUR_KEY"
    "RESEND_FROM_EMAIL" = "you@yourdomain.com"
    "QR_JWT_SECRET" = "your-random-secret-256-bits"
}

cd "C:\Users\THE PRO ONE\TrustEngine"

foreach ($key in $secrets.Keys) {
    Write-Host "Setting $key..."
    npx supabase secrets set "$key=$($secrets[$key])"
}

Write-Host "Done! Verify with: npx supabase secrets list"
```

---

*Document generated from AI-assisted development logs*  
*August 10, 2026*
