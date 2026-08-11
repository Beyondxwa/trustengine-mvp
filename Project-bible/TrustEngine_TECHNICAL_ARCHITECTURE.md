# TrustEngine — Technical Architecture

> **Version:** MVP  
> **Last Updated:** August 10, 2026

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Browser    │  │  Mobile QR  │  │  Stripe Dashboard   │ │
│  │  (Next.js)  │  │  Scanner    │  │  (Webhooks)         │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
└─────────┼────────────────┼────────────────────┼────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   SUPABASE PLATFORM                            │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │  Auth (JWT)     │  │  Edge Functions (Deno Runtime)  │   │
│  │  ├─ Sign In     │  │  ├─ create-qr-session           │   │
│  │  ├─ Sign Up     │  │  ├─ submit-feedback             │   │
│  │  └─ Sessions    │  │  ├─ validate-qr-session         │   │
│  └─────────────────┘  │  ├─ get-feedback                  │   │
│  ┌─────────────────┐  │  ├─ send-sms-alert                │   │
│  │  PostgreSQL     │  │  ├─ invite-staff                │   │
│  │  ├─ tenants     │  │  ├─ create-checkout-session     │   │
│  │  ├─ users       │  │  ├─ stripe-webhook              │   │
│  │  ├─ feedback_   │  │  └─ send-email                  │   │
│  │  │  submissions  │  └─────────────────────────────────┘   │
│  │  ├─ user_tenants│                                        │
│  │  └─ qr_sessions │                                        │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Stripe    │  │   Twilio    │  │      Resend         │ │
│  │  (Payments) │  │  (SMS)      │  │    (Email)          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### Next.js 15 App Router

**File Structure:**
```
app/
├── page.tsx                    # Landing / login page
├── layout.tsx                  # Root layout with providers
├── middleware.ts               # Auth route protection
└── dashboard/
    ├── page.tsx                # Dashboard overview
    ├── layout.tsx              # Dashboard shell (sidebar + header)
    ├── qr/
    │   └── page.tsx            # QR code generation
    ├── inbox/
    │   └── page.tsx            # Feedback inbox (POST to get-feedback)
    ├── team/
    │   └── page.tsx            # Team management
    └── settings/
        └── page.tsx            # Business settings (RLS-protected)
```

### State Management
- **Server State:** Supabase real-time subscriptions + React Query patterns
- **Client State:** React `useState` / `useReducer` for form state
- **Auth State:** Supabase Auth context (JWT tokens, session persistence)

### Key Frontend Decisions
1. **Typed Routes:** `typedRoutes: true` in `next.config.ts` — enables type-safe routing
2. **Middleware Auth:** Protected routes redirect unauthenticated users to login
3. **Server Components:** Dashboard pages use RSC where possible; client components for interactivity
4. **Tailwind CSS:** Utility-first styling with custom color tokens from tenant settings

---

## Backend Architecture

### Edge Functions (Deno Runtime)

All backend logic runs as Supabase Edge Functions — serverless Deno functions deployed globally.

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `create-qr-session` | POST | Bearer (JWT) | Creates a QR session with embedded JWT |
| `submit-feedback` | POST | None | Public endpoint for customer feedback |
| `validate-qr-session` | POST | None | Validates QR scan before showing form |
| `get-feedback` | POST | Bearer (JWT) | Retrieves feedback for tenant inbox |
| `send-sms-alert` | POST | Service Role | Sends SMS via Twilio |
| `invite-staff` | POST | Bearer (JWT) | Sends email invite via Resend |
| `create-checkout-session` | POST | Bearer (JWT) | Creates Stripe checkout URL |
| `stripe-webhook` | POST | Stripe Signature | Handles Stripe events |
| `send-email` | POST | Service Role | Generic email delivery via Resend |

### Function Patterns

**Authenticated Function Pattern:**
```typescript
// All auth-required functions follow this pattern
const authHeader = req.headers.get('Authorization');
const token = authHeader?.replace('Bearer ', '');
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) return new Response('Unauthorized', { status: 401 });
```

**Public Function Pattern:**
```typescript
// submit-feedback and validate-qr-session are public
// They validate session_id from the QR code JWT instead of auth
```

---

## Database Architecture

### Core Tables

#### `tenants` — Business Accounts
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  primary_color TEXT DEFAULT '#3B82F6',
  secondary_color TEXT DEFAULT '#10B981',
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `users` — Auth Users (managed by Supabase Auth)
```sql
-- Managed by supabase_auth.users
-- Extended via public.users if needed
```

#### `user_tenants` — Many-to-Many Membership
```sql
CREATE TABLE user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);
```

#### `feedback_submissions` — Customer Feedback
```sql
CREATE TABLE feedback_submissions (
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
```

#### `qr_sessions` — QR Code Sessions
```sql
CREATE TABLE qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Row Level Security (RLS)

**CRITICAL:** All tables must have RLS enabled. Without it, authenticated users get 406 errors.

```sql
-- Tenants table RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_user_read ON tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

CREATE POLICY tenants_user_update ON tenants
  FOR UPDATE USING (
    id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

-- Feedback submissions RLS
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_tenant_read ON feedback_submissions
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

CREATE POLICY feedback_public_insert ON feedback_submissions
  FOR INSERT WITH CHECK (true); -- Public submissions allowed
```

---

## Authentication Flow

```
1. User visits / → Login form
2. Supabase Auth validates email/password
3. JWT token stored in localStorage / cookie
4. Middleware checks token on /dashboard/* routes
5. Token sent as Bearer header to Edge Functions
6. Functions validate token via supabase.auth.getUser()
7. user_tenants table determines tenant access and role
```

### JWT in QR Codes
QR codes embed a **session JWT** (different from auth JWT):
- Contains: `tenant_id`, `session_id`, `exp`
- Signed with `QR_JWT_SECRET` (set in Supabase secrets)
- Validated by `validate-qr-session` function
- Allows public feedback submission without user auth

---

## Data Flow: QR → Feedback → Inbox

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Business    │────▶│ create-qr-session│────▶│  QR Image    │
│  Owner       │     │ (Edge Function)  │     │  (JWT Embed) │
└──────────────┘     └──────────────────┘     └──────┬───────┘
                                                      │
                                                      ▼
                                              ┌──────────────┐
                                              │  Customer    │
                                              │  Scans QR    │
                                              └──────┬───────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │ validate-qr  │
                                              │ -session     │
                                              └──────┬───────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │ Feedback Form │
                                              │ (Public Page) │
                                              └──────┬───────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │submit-feedback│
                                              │ (Edge Func)  │
                                              └──────┬───────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │ feedback_    │
                                              │ submissions  │
                                              │ (PostgreSQL) │
                                              └──────┬───────┘
                                                     │
                                                     ▼
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Business    │◀────│   get-feedback   │◀────│   Inbox UI   │
│  Owner       │     │ (Edge Function)  │     │  (Next.js)   │
└──────────────┘     └──────────────────┘     └──────────────┘
```

---

## External Service Integration

### Stripe
- **create-checkout-session:** Creates Stripe Checkout URL for subscription
- **stripe-webhook:** Receives `checkout.session.completed` events
- **Secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### Twilio
- **send-sms-alert:** Sends SMS when new feedback arrives
- **Secrets:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

### Resend
- **send-email:** Generic email delivery
- **invite-staff:** Sends team invitation emails
- **Secrets:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

---

## Security Considerations

### Current (MVP)
- ✅ HTTPS enforced by Supabase
- ✅ JWT-based auth
- ✅ RLS policies on tenants and feedback
- ✅ Edge Functions validate auth tokens

### Sprint 1 Hardening
- ⏳ Rate limiting on Edge Functions
- ⏳ Input validation/sanitization
- ⏳ CORS policy tightening
- ⏳ Dependency vulnerability scanning
- ⏳ Strong JWT secrets rotation
- ⏳ API key encryption at rest

---

## Performance Notes

- **First compile:** 47-60s (cold start)
- **Hot reload:** ~2-9s after initial compile
- **Edge Function cold start:** ~200-500ms
- **Database queries:** <50ms for typical reads

### Optimization Opportunities
- Add CDN for static assets (Vercel Edge Network)
- Implement query caching for get-feedback
- Add pagination to inbox (limit/offset)
- Use React Server Components for dashboard shell

---

## Deployment Architecture

### Current: Local Dev + Supabase Backend
```
[Local Machine]          [Supabase Cloud]
  Next.js dev  ────────▶  Edge Functions
  server (3000)          PostgreSQL
                         Auth
```

### Target: Full Production
```
[Vercel Edge]            [Supabase Cloud]         [External]
  Next.js prod  ───────▶  Edge Functions  ─────▶  Stripe
  (Global CDN)           PostgreSQL      ─────▶  Twilio
                         Auth            ─────▶  Resend
```

---

*Document generated from AI-assisted development logs*  
*August 10, 2026*
