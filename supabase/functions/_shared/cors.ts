// File: functions/_shared/cors.ts
// Purpose: CORS headers helper for Edge Functions
// Depends on: None

export const corsHeaders = (origin?: string) => ({
  'Access-Control-Allow-Origin': origin || process.env.APP_URL || '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
});

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  return null;
}
