// File: functions/_shared/validators.ts
// Purpose: Zod validation schemas for Edge Functions
// Depends on: zod (via esm.sh)

import { z } from 'https://esm.sh/zod@3.23.0';

// QR Token validation
export const qrTokenSchema = z.object({
  session_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  iat: z.number(),
  exp: z.number(),
});

// Feedback submission validation
export const feedbackSubmissionSchema = z.object({
  token: z.string().min(1, 'QR token is required'),
  rating: z.number().int().min(1).max(5, 'Rating must be between 1 and 5'),
  selected_tags: z.array(z.string()).max(5, 'Maximum 5 tags allowed').default([]),
  comment: z.string().max(500, 'Comment must be 500 characters or less').nullable().optional(),
  nps_score: z.number().int().min(0).max(10).nullable().optional(),
  customer_phone: z.string().nullable().optional(),
  customer_email: z.string().email().nullable().optional(),
});

// Staff invite validation
export const staffInviteSchema = z.object({
  email: z.string().email('Valid email is required'),
  role: z.enum(['staff', 'manager'], {
    errorMap: () => ({ message: 'Role must be staff or manager' }),
  }),
  tenant_id: z.string().uuid('Valid tenant ID is required'),
});

// Webhook payload validation (generic)
export const webhookPayloadSchema = z.object({
  type: z.string(),
  data: z.record(z.unknown()),
});

// Pagination params
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// Date range filter
export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
