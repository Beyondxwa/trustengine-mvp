// File: functions/_shared/auth.ts
// Purpose: JWT validation and tenant membership checks
// Depends on: @supabase/supabase-js

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

interface AuthResult {
  userId: string | null;
  tenantId: string | null;
  role: string | null;
  error: string | null;
}

export async function validateAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization');
  
  if (!authHeader) {
    return { userId: null, tenantId: null, role: null, error: 'Missing authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');
  
  if (!token) {
    return { userId: null, tenantId: null, role: null, error: 'Invalid authorization header' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { userId: null, tenantId: null, role: null, error: 'Invalid or expired token' };
  }

  // Get user's tenant membership
  const { data: userTenant } = await supabase
    .from('user_tenants')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  return {
    userId: user.id,
    tenantId: userTenant?.tenant_id || null,
    role: userTenant?.role || null,
    error: null,
  };
}

export function requireAuth(authResult: AuthResult): { userId: string; tenantId: string; role: string } {
  if (authResult.error || !authResult.userId || !authResult.tenantId) {
    throw new ApiError(401, authResult.error || 'Unauthorized');
  }
  return {
    userId: authResult.userId,
    tenantId: authResult.tenantId,
    role: authResult.role || 'staff',
  };
}

export function requireRole(authResult: AuthResult, allowedRoles: string[]): { userId: string; tenantId: string; role: string } {
  const auth = requireAuth(authResult);
  if (!allowedRoles.includes(auth.role)) {
    throw new ApiError(403, `Required role: ${allowedRoles.join(' or ')}`);
  }
  return auth;
}

// Import ApiError from errors.ts
import { ApiError } from './errors.ts';
