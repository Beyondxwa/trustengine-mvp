import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SignJWT } from "https://esm.sh/jose@5.2.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret = Deno.env.get("QR_JWT_SECRET");

    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase env vars");
    if (!jwtSecret) throw new Error("Missing QR_JWT_SECRET");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── 1. Authenticate user ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const accessToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Resolve tenant ──
    const { data: membership } = await supabase
      .from("user_tenants")
      .select("tenant_id, tenants(id, name, slug, plan_type)")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return new Response(
        JSON.stringify({ success: false, error: "No tenant found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const tenantMembership = membership.tenants as {
      id: string;
      name: string;
      slug: string | null;
      plan_type: string;
    };

    // Confirm slug from tenants table for QR review URL
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, plan_type")
      .eq("id", membership.tenant_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ success: false, error: "Tenant not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantSlug =
      tenant.slug ||
      tenantMembership.slug ||
      (tenant.name
        ? String(tenant.name).toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
        : tenant.id);

    // ── 3. Rate limit check ──
    const { count } = await supabase
      .from("qr_sessions")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

    const limits: Record<string, number> = { hook: 5, solo: 20, team: 50, enterprise: 200 };
    const limit = limits[tenant.plan_type] || 5;
    if ((count || 0) >= limit) {
      return new Response(
        JSON.stringify({ success: false, error: `Rate limit: ${limit} QR codes/hour` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Create JWT token ──
    const sessionId = crypto.randomUUID();
    const token = await new SignJWT({ tenant_id: tenant.id, session_id: sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(jwtSecret));

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // ── 5. Store session ──
    const { error: insertError } = await supabase.from("qr_sessions").insert({
      tenant_id: tenant.id,
      token,
      session_id: sessionId,
      expires_at: expiresAt,
      is_used: false,
    });
    if (insertError) throw new Error(insertError.message);

    // ── 6. Return ──
    const qrUrl = `https://trustengine-mvp-8vxb.vercel.app/${tenantSlug}/review?token=${token}`;
    return new Response(
      JSON.stringify({
        success: true,
        data: { token, session_id: sessionId, expires_at: expiresAt, qr_url: qrUrl },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("create-qr-session error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

