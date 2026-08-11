import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ── Logger ──
function logSMS(
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  context?: Record<string, unknown>
) {
  const ts = new Date().toISOString();
  const ctx = context ? ` | Context: ${JSON.stringify(context)}` : "";
  const line = `[TRUSTENGINE] [SendSMS] [${level}] ${message}${ctx} | Timestamp: ${ts}`;
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 8) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-3)}`;
}

function maskId(id: string): string {
  if (!id || id.length < 8) return "***";
  return `${id.slice(0, 4)}***${id.slice(-4)}`;
}

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
      JSON.stringify({ success: false, error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFrom = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    if (!twilioSid || !twilioToken || !twilioFrom) {
      throw new Error("Missing Twilio environment variables");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── 1. Parse body ──
    let body: { notification_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { notification_id } = body;
    if (!notification_id) {
      return new Response(
        JSON.stringify({ success: false, error: "notification_id is required", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Fetch notification ──
    const { data: notification, error: notifError } = await supabase
      .from("notifications")
      .select("id, tenant_id, type, title, body, data, status")
      .eq("id", notification_id)
      .single();

    if (notifError || !notification) {
      return new Response(
        JSON.stringify({ success: false, error: "Notification not found", code: "NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (notification.type !== "negative_alert") {
      logSMS("INFO", "Skipping non-negative notification", { type: notification.type });
      return new Response(
        JSON.stringify({ success: true, data: { sent: false, reason: "Not a negative alert" } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Find recipients (owners, managers, admins) ──
    const { data: recipients, error: recipError } = await supabase
      .from("user_tenants")
      .select("user_id, role, profiles(phone)")
      .eq("tenant_id", notification.tenant_id)
      .in("role", ["owner", "manager", "admin"]);

    if (recipError) {
      logSMS("ERROR", "Failed to fetch recipients", { error: recipError.message });
      throw new Error("Database error fetching recipients");
    }

    const phones: { userId: string; phone: string; role: string }[] = [];
    for (const r of recipients || []) {
      const profile = r.profiles as { phone: string | null } | null;
      if (profile?.phone) {
        phones.push({ userId: r.user_id, phone: profile.phone, role: r.role });
      }
    }

    if (phones.length === 0) {
      logSMS("WARN", "No recipients with phone numbers found", {
        tenantId: maskId(notification.tenant_id),
      });
      return new Response(
        JSON.stringify({ success: true, data: { sent: false, reason: "No phone numbers on file" } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Send SMS via Twilio ──
    const feedbackData = notification.data as { feedback_id?: string; rating?: number } | null;
    const smsBody = `🚨 TrustEngine Alert: A customer left a ${feedbackData?.rating || "low"}-star review. Check your dashboard immediately.`;

    const authHeader = "Basic " + btoa(`${twilioSid}:${twilioToken}`);
    const results: { phone: string; status: string; sid?: string; error?: string }[] = [];

    for (const recipient of phones) {
      try {
        const formData = new URLSearchParams({
          From: twilioFrom,
          To: recipient.phone,
          Body: smsBody,
        });

        const twilioRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData.toString(),
          }
        );

        const twilioData = await twilioRes.json();

        if (!twilioRes.ok) {
          logSMS("WARN", "Twilio send failed", {
            phone: maskPhone(recipient.phone),
            error: twilioData.message,
          });
          results.push({
            phone: maskPhone(recipient.phone),
            status: "failed",
            error: twilioData.message,
          });
        } else {
          logSMS("INFO", "SMS sent successfully", {
            phone: maskPhone(recipient.phone),
            sid: twilioData.sid,
          });
          results.push({
            phone: maskPhone(recipient.phone),
            status: "sent",
            sid: twilioData.sid,
          });
        }
      } catch (err: any) {
        logSMS("ERROR", "Exception sending SMS", {
          phone: maskPhone(recipient.phone),
          error: err.message,
        });
        results.push({
          phone: maskPhone(recipient.phone),
          status: "failed",
          error: err.message,
        });
      }
    }

    // ── 5. Update notification status ──
    const allSent = results.every((r) => r.status === "sent");
    await supabase
      .from("notifications")
      .update({
        status: allSent ? "delivered" : "partial_failure",
        metadata: { delivery_results: results },
      })
      .eq("id", notification_id);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          sent: allSent,
          recipients: results.length,
          details: results,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    logSMS("ERROR", "Unhandled error", { message: err.message });
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
