import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ============================================
// CORS & CONFIG
// ============================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
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

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── 1. Authenticate caller ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Parse & validate body ──
    let body: { email?: string; role?: string; tenant_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, role = "staff", tenant_id } = body;

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id is required", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Valid email is required", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!["staff", "manager"].includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: "Role must be 'staff' or 'manager'", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Verify inviter has permission ──
    const { data: membership, error: memError } = await supabase
      .from("user_tenants")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenant_id)
      .single();

    if (memError || !membership) {
      return new Response(
        JSON.stringify({ success: false, error: "You do not belong to this tenant", code: "FORBIDDEN" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["owner", "manager", "admin"].includes(membership.role)) {
      return new Response(
        JSON.stringify({ success: false, error: "Only owners, managers, and admins can invite staff", code: "FORBIDDEN" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Check for existing pending invite ──
    const { data: existingInvite, error: existingError } = await supabase
      .from("staff_invites")
      .select("id, status, expires_at")
      .eq("tenant_id", tenant_id)
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing invite:", existingError);
    }

    if (existingInvite) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "An active invite already exists for this email",
          code: "DUPLICATE_INVITE",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 5. Create invite ──
    const { data: invite, error: insertError } = await supabase
      .from("staff_invites")
      .insert({
        tenant_id,
        invited_by: user.id,
        email: normalizedEmail,
        role,
      })
      .select("id, token, email, role, expires_at, created_at")
      .single();

    if (insertError || !invite) {
      console.error("Invite insert error:", insertError);
      throw new Error("Failed to create invite");
    }

    // ── 6. Return invite data ──
    // NOTE: Email sending (Resend/SendGrid) will be added in Phase 4.
    // For now, the frontend displays the invite link or copies it to clipboard.
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          invite_id: invite.id,
          token: invite.token,
          email: invite.email,
          role: invite.role,
          expires_at: invite.expires_at,
          invite_url: `https://TRUSTENGINE_PROD_URL/invite?token=${invite.token}`,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("invite-staff error:", err);
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
