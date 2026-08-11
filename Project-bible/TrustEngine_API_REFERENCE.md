# TrustEngine — API Reference

> **Base URL:** `https://glpemdsqzcawrlnryppn.supabase.co/functions/v1`  
> **Last Updated:** August 10, 2026

---

## Authentication

### Auth-Required Endpoints
Send JWT token in `Authorization` header:
```
Authorization: Bearer <supabase-jwt-token>
```

### Public Endpoints
No auth header needed. These use QR session tokens instead.

---

## Endpoints

### 1. create-qr-session
**Creates a QR code session with embedded JWT.**

- **URL:** `/create-qr-session`
- **Method:** `POST`
- **Auth:** Required (Bearer token)
- **Content-Type:** `application/json`

**Request Body:**
```json
{
  "tenant_id": "20dd21cf-f8e7-4663-af70-afe891750399"
}
```

**Response (200):**
```json
{
  "success": true,
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "qr_url": "https://glpemdsqzcawrlnryppn.supabase.co/functions/v1/validate-qr-session?token=eyJ...",
  "expires_at": "2026-08-10T12:00:00Z"
}
```

**Response (401):**
```json
{
  "error": "Unauthorized"
}
```

**Response (400):**
```json
{
  "error": "tenant_id is required"
}
```

---

### 2. submit-feedback
**Public endpoint for customers to submit feedback via QR scan.**

- **URL:** `/submit-feedback`
- **Method:** `POST`
- **Auth:** None (public)
- **Content-Type:** `application/json`

**Request Body:**
```json
{
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "rating": 5,
  "comment": "Great service!",
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "+15551234567"
}
```

**Required Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | UUID | Yes | QR session ID |
| `rating` | integer (1-5) | Yes | Star rating |
| `comment` | string | No | Written feedback |
| `customer_name` | string | No | Customer name |
| `customer_email` | string | No | Customer email |
| `customer_phone` | string | No | Customer phone |

**Response (200):**
```json
{
  "success": true,
  "feedback_id": "f1e2d3c4-b5a6-7890-fedc-ba0987654321"
}
```

**Response (400):**
```json
{
  "error": "Invalid session or session expired"
}
```

---

### 3. validate-qr-session
**Validates a QR code scan before showing the feedback form.**

- **URL:** `/validate-qr-session`
- **Method:** `POST` or `GET`
- **Auth:** None (public)

**Query Parameters (GET):**
```
?token=eyJhbGciOiJIUzI1NiIs...
```

**Request Body (POST):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**
```json
{
  "valid": true,
  "tenant_id": "20dd21cf-f8e7-4663-af70-afe891750399",
  "tenant_name": "The Pro One",
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "primary_color": "#3B82F6",
  "secondary_color": "#10B981"
}
```

**Response (400):**
```json
{
  "valid": false,
  "error": "Invalid or expired token"
}
```

---

### 4. get-feedback
**Retrieves feedback submissions for a tenant's inbox.**

- **URL:** `/get-feedback`
- **Method:** `POST`
- **Auth:** Required (Bearer token)
- **Content-Type:** `application/json`

**Request Body:**
```json
{
  "tenant_id": "20dd21cf-f8e7-4663-af70-afe891750399",
  "limit": 20,
  "offset": 0,
  "sort_by": "created_at",
  "sort_order": "desc"
}
```

**Optional Parameters:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | 20 | Max results per page |
| `offset` | integer | 0 | Pagination offset |
| `sort_by` | string | `created_at` | Sort field |
| `sort_order` | string | `desc` | `asc` or `desc` |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "f1e2d3c4-b5a6-7890-fedc-ba0987654321",
      "rating": 5,
      "comment": "Great service!",
      "customer_name": "John Doe",
      "customer_email": "john@example.com",
      "created_at": "2026-08-10T10:30:00Z"
    }
  ],
  "total": 1,
  "hasMore": false
}
```

**Response (401):**
```json
{
  "error": "Unauthorized"
}
```

---

### 5. send-sms-alert
**Sends SMS notification when new feedback arrives.**

- **URL:** `/send-sms-alert`
- **Method:** `POST`
- **Auth:** Service Role (internal use)
- **Content-Type:** `application/json`

**Request Body:**
```json
{
  "phone": "+15551234567",
  "message": "New 5-star review from John Doe!"
}
```

**Response (200):**
```json
{
  "success": true,
  "sid": "SM1234567890abcdef"
}
```

**Response (500):**
```json
{
  "error": "Failed to send SMS",
  "details": "Twilio credentials not configured"
}
```

---

### 6. invite-staff
**Sends email invitation to join a tenant.**

- **URL:** `/invite-staff`
- **Method:** `POST`
- **Auth:** Required (Bearer token)
- **Content-Type:** `application/json`

**Request Body:**
```json
{
  "email": "newstaff@example.com",
  "tenant_id": "20dd21cf-f8e7-4663-af70-afe891750399",
  "role": "staff"
}
```

**Response (200):**
```json
{
  "success": true,
  "invite_id": "i1a2b3c4-d5e6-7890-fghi-jk1234567890"
}
```

**Response (400):**
```json
{
  "error": "Invalid role. Must be 'admin' or 'staff'"
}
```

---

### 7. create-checkout-session
**Creates a Stripe checkout session for subscription.**

- **URL:** `/create-checkout-session`
- **Method:** `POST`
- **Auth:** Required (Bearer token)
- **Content-Type:** `application/json`

**Request Body:**
```json
{
  "tenant_id": "20dd21cf-f8e7-4663-af70-afe891750399",
  "price_id": "price_1234567890abcdef",
  "success_url": "https://yourapp.com/dashboard?success=true",
  "cancel_url": "https://yourapp.com/dashboard?canceled=true"
}
```

**Response (200):**
```json
{
  "success": true,
  "url": "https://checkout.stripe.com/pay/cs_test_..."
}
```

**Response (500):**
```json
{
  "error": "Stripe secret key not configured"
}
```

---

### 8. stripe-webhook
**Receives Stripe payment event webhooks.**

- **URL:** `/stripe-webhook`
- **Method:** `POST`
- **Auth:** Stripe signature verification
- **Content-Type:** `application/json`

**Headers:**
```
Stripe-Signature: t=1234567890,v1=abc123...
```

**Response (200):**
```json
{
  "received": true
}
```

**Response (400):**
```json
{
  "error": "Invalid signature"
}
```

---

### 9. send-email
**Generic email delivery via Resend.**

- **URL:** `/send-email`
- **Method:** `POST`
- **Auth:** Service Role (internal use)
- **Content-Type:** `application/json`

**Request Body:**
```json
{
  "to": "recipient@example.com",
  "subject": "Welcome to TrustEngine",
  "html": "<h1>Hello!</h1><p>Welcome aboard.</p>",
  "text": "Hello! Welcome aboard."
}
```

**Response (200):**
```json
{
  "success": true,
  "id": "email_1234567890"
}
```

**Response (500):**
```json
{
  "error": "Resend API key not configured"
}
```

---

## Error Codes

| HTTP Code | Meaning | Common Causes |
|-----------|---------|---------------|
| 200 | Success | Request processed correctly |
| 400 | Bad Request | Missing required fields, invalid data |
| 401 | Unauthorized | Missing/wrong Bearer token |
| 404 | Not Found | Function not deployed or wrong URL |
| 406 | Not Acceptable | RLS policy blocking database access |
| 500 | Server Error | Missing secrets, external API failure |

---

## Testing with PowerShell

### Test Auth-Required Endpoint
```powershell
$ANON = "YOUR_ANON_KEY"
$URL = "https://glpemdsqzcawrlnryppn.supabase.co/functions/v1"

Invoke-RestMethod -Uri "$URL/get-feedback" -Method POST `
  -Headers @{"Authorization"="Bearer $ANON";"Content-Type"="application/json"} `
  -Body '{"tenant_id":"20dd21cf-f8e7-4663-af70-afe891750399"}'
```

### Test Public Endpoint
```powershell
Invoke-RestMethod -Uri "$URL/submit-feedback" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"session_id":"YOUR_SESSION","rating":5,"comment":"test"}'
```

---

*Document generated from AI-assisted development logs*  
*August 10, 2026*
