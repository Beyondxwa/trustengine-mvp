import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { jwtVerify } from "https://esm.sh/jose@5.2.2";

// ============================================
// CORS & CONFIG
// ============================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret = Deno.env.get("QR_JWT_SECRET");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    if (!jwtSecret) {
      throw new Error("Missing QR_JWT_SECRET environment variable");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── 1. Parse body ──
    let body: { token?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { token } = body;
    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing token in request body", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Verify JWT signature & expiry ──
    let payload: {
      session_id: string;
      tenant_id: string;
    };

    try {
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload: verifiedPayload } = await jwtVerify(token, secret, {
        clockTolerance: 30, // 30-second leeway for clock skew
      });
      payload = verifiedPayload as any;
    } catch (err: any) {
      const message = err.code === "ERR_JWT_EXPIRED" ? "QR code has expired" : "Invalid QR code token";
      const code = err.code === "ERR_JWT_EXPIRED" ? "SESSION_EXPIRED" : "INVALID_TOKEN";
      return new Response(
        JSON.stringify({ success: false, error: message, code }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Look up session in database ──
    const { data: session, error: sessionError } = await supabase
      .from("qr_sessions")
      .select("id, tenant_id, session_id, expires_at, is_used, used_at")
      .eq("session_id", payload.session_id)
      .eq("tenant_id", payload.tenant_id)
      .eq("token", token)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ success: false, error: "Session not found", code: "SESSION_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Check session status ──
    if (session.is_used) {
      return new Response(
        JSON.stringify({ success: false, error: "This QR code has already been used", code: "SESSION_USED" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(session.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: "This QR code has expired", code: "SESSION_EXPIRED" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 5. Fetch tenant info & review platforms ──
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, logo_url, primary_color, secondary_color")
      .eq("id", payload.tenant_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ success: false, error: "Tenant not found", code: "TENANT_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: platforms, error: platformsError } = await supabase
      .from("review_platforms")
      .select("platform, url, is_primary")
      .eq("tenant_id", payload.tenant_id);

    if (platformsError) {
      console.error("Failed to fetch review platforms:", platformsError);
    }

    // ── 6. Mark session as used ──
    const usedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("qr_sessions")
      .update({
        is_used: true,
        used_at: usedAt,
      })
      .eq("id", session.id);

    if (updateError) {
      console.error("Failed to mark session as used:", updateError);
      // Non-fatal: continue anyway so customer isn't blocked
    }

    // ── 7. Return session + tenant data ──
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          session: {
            id: session.id,
            session_id: session.session_id,
            tenant_id: session.tenant_id,
            is_used: true,
            used_at: usedAt,
          },
          tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            logo_url: tenant.logo_url,
            primary_color: tenant.primary_color,
            secondary_color: tenant.secondary_color,
          },
          review_platforms: platforms ?? [],
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("validate-qr-session error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Internal server error",
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
