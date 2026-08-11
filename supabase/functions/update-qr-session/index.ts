import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { jwtVerify } from "https://esm.sh/jose@5.2.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed",
        code: "METHOD_NOT_ALLOWED",
      }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
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

    let body: { token?: string; status?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid JSON body",
          code: "BAD_REQUEST",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { token, status } = body;
    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing token in request body",
          code: "BAD_REQUEST",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    if (!status || typeof status !== "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing status in request body",
          code: "BAD_REQUEST",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const allowedStatuses = ["redirected", "active", "used", "expired"];
    if (!allowedStatuses.includes(status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid status value",
          code: "BAD_REQUEST",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let payload: { session_id: string; tenant_id: string };
    try {
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload: verifiedPayload } = await jwtVerify(token, secret, {
        clockTolerance: 30,
      });
      payload = verifiedPayload as {
        session_id: string;
        tenant_id: string;
      };
    } catch (err: any) {
      const message =
        err.code === "ERR_JWT_EXPIRED"
          ? "QR code has expired"
          : "Invalid QR code token";
      const code =
        err.code === "ERR_JWT_EXPIRED" ? "SESSION_EXPIRED" : "INVALID_TOKEN";
      return new Response(
        JSON.stringify({ success: false, error: message, code }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: session, error: sessionError } = await supabase
      .from("qr_sessions")
      .select("id, tenant_id, session_id, expires_at")
      .eq("session_id", payload.session_id)
      .eq("tenant_id", payload.tenant_id)
      .eq("token", token)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Session not found",
          code: "SESSION_NOT_FOUND",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (new Date(session.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "This QR code has expired",
          code: "SESSION_EXPIRED",
        }),
        {
          status: 410,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const updatePayload: Record<string, unknown> = { status };
    if (status === "redirected" || status === "used") {
      updatePayload.is_used = true;
      updatePayload.used_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("qr_sessions")
      .update(updatePayload)
      .eq("id", session.id);

    if (updateError) {
      console.error("Failed to update qr session:", updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to update session",
          code: "UPDATE_FAILED",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          session_id: session.session_id,
          status,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("update-qr-session error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Internal server error",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
