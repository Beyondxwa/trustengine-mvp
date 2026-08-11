import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

// ── Structured Logger ──
function logWebhook(
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  context?: Record<string, unknown>
) {
  const ts = new Date().toISOString();
  const ctx = context ? ` | Context: ${JSON.stringify(context)}` : "";
  const line = `[TRUSTENGINE] [StripeWebhook] [${level}] ${message}${ctx} | Timestamp: ${ts}`;
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

function maskId(id: string): string {
  if (!id || id.length < 8) return "***";
  return `${id.slice(0, 4)}***${id.slice(-4)}`;
}

// ── Verify Stripe signature ──
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const parts = signature.split(",");
  const sigMap: Record<string, string> = {};
  for (const part of parts) {
    const [key, val] = part.split("=");
    if (key && val) sigMap[key.trim()] = val.trim();
  }
  const timestamp = sigMap["t"];
  const expectedSig = sigMap["v1"];
  if (!timestamp || !expectedSig) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return sigHex === expectedSig;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
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
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    if (!stripeWebhookSecret) {
      throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const payload = await req.text();
    const signature = req.headers.get("stripe-signature") || "";

    // ── Verify signature ──
    const isValid = await verifyStripeSignature(payload, signature, stripeWebhookSecret);
    if (!isValid) {
      logWebhook("WARN", "Invalid Stripe signature", { signature: signature.slice(0, 20) + "..." });
      return new Response(
        JSON.stringify({ success: false, error: "Invalid signature", code: "INVALID_SIGNATURE" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const event = JSON.parse(payload);
    logWebhook("INFO", `Received ${event.type}`, { eventId: event.id });

    // ── Handle checkout.session.completed ──
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const tenantId = session.metadata?.tenant_id;
      const planType = session.metadata?.plan_type;
      const subscriptionId = session.subscription;

      if (!tenantId || !planType) {
        logWebhook("WARN", "Missing metadata in checkout session", {
          sessionId: maskId(session.id),
        });
        return new Response(
          JSON.stringify({ success: false, error: "Missing metadata", code: "BAD_REQUEST" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update tenant
      const { error: updateError } = await supabase
        .from("tenants")
        .update({
          plan_type: planType,
          stripe_subscription_id: subscriptionId,
          subscription_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);

      if (updateError) {
        logWebhook("ERROR", "Failed to update tenant after payment", {
          tenantId: maskId(tenantId),
          error: updateError.message,
        });
        throw new Error("Database update failed");
      }

      // Log billing event
      await supabase.from("billing_events").insert({
        tenant_id: tenantId,
        event_type: "checkout_completed",
        stripe_event_id: event.id,
        payload: {
          plan_type: planType,
          subscription_id: subscriptionId,
          customer_id: session.customer,
          amount_total: session.amount_total,
        },
      });

      logWebhook("INFO", "Tenant upgraded successfully", {
        tenantId: maskId(tenantId),
        planType,
      });
    }

    // ── Handle invoice.payment_failed ──
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;

      // Find tenant by subscription ID
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("id")
        .eq("stripe_subscription_id", subscriptionId)
        .single();

      if (tenantError || !tenant) {
        logWebhook("WARN", "Tenant not found for failed payment", {
          subscriptionId: maskId(subscriptionId),
        });
      } else {
        await supabase
          .from("tenants")
          .update({ subscription_status: "past_due", updated_at: new Date().toISOString() })
          .eq("id", tenant.id);

        await supabase.from("billing_events").insert({
          tenant_id: tenant.id,
          event_type: "payment_failed",
          stripe_event_id: event.id,
          payload: { subscription_id: subscriptionId, invoice_id: invoice.id },
        });

        logWebhook("WARN", "Payment failed — tenant marked past_due", {
          tenantId: maskId(tenant.id),
        });
      }
    }

    // ── Handle customer.subscription.deleted ──
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("id")
        .eq("stripe_subscription_id", subscription.id)
        .single();

      if (tenantError || !tenant) {
        logWebhook("WARN", "Tenant not found for subscription deletion", {
          subscriptionId: maskId(subscription.id),
        });
      } else {
        await supabase
          .from("tenants")
          .update({
            plan_type: "hook",
            subscription_status: "canceled",
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tenant.id);

        await supabase.from("billing_events").insert({
          tenant_id: tenant.id,
          event_type: "subscription_canceled",
          stripe_event_id: event.id,
          payload: { subscription_id: subscription.id },
        });

        logWebhook("INFO", "Subscription canceled — downgraded to hook", {
          tenantId: maskId(tenant.id),
        });
      }
    }

    // ── Handle customer.subscription.updated ──
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("id")
        .eq("stripe_subscription_id", subscription.id)
        .single();

      if (tenantError || !tenant) {
        logWebhook("WARN", "Tenant not found for subscription update", {
          subscriptionId: maskId(subscription.id),
        });
      } else {
        const status = subscription.status; // active, past_due, canceled, etc.
        await supabase
          .from("tenants")
          .update({ subscription_status: status, updated_at: new Date().toISOString() })
          .eq("id", tenant.id);

        await supabase.from("billing_events").insert({
          tenant_id: tenant.id,
          event_type: "subscription_updated",
          stripe_event_id: event.id,
          payload: { status, subscription_id: subscription.id },
        });

        logWebhook("INFO", "Subscription status updated", {
          tenantId: maskId(tenant.id),
          status,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    logWebhook("ERROR", "Unhandled webhook error", { message: err.message });
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
