import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRICE_MAP: Record<string, string> = {
  hook: "",
  solo: Deno.env.get("STRIPE_PRICE_SOLO") || "",
  team: Deno.env.get("STRIPE_PRICE_TEAM") || "",
  enterprise: Deno.env.get("STRIPE_PRICE_ENTERPRISE") || "",
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
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    if (!stripeSecret) throw new Error("Missing STRIPE_SECRET_KEY environment variable");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

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

    let body: { plan_type?: string; success_url?: string; cancel_url?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { plan_type, success_url, cancel_url } = body;
    if (!plan_type || !["solo", "team", "enterprise"].includes(plan_type)) {
      return new Response(
        JSON.stringify({ success: false, error: "Valid plan_type required (solo, team, enterprise)", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const priceId = PRICE_MAP[plan_type];
    if (!priceId) {
      return new Response(
        JSON.stringify({ success: false, error: "Price not configured for this plan", code: "CONFIG_ERROR" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: membership, error: memError } = await supabase
      .from("user_tenants")
      .select("tenant_id, role, tenants(id, name, stripe_customer_id)")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memError || !membership) {
      return new Response(
        JSON.stringify({ success: false, error: "No tenant membership found", code: "NO_TENANT" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenant = membership.tenants as { id: string; name: string; stripe_customer_id: string | null };

    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          name: tenant.name,
          metadata: JSON.stringify({ tenant_id: tenant.id, supabase_user_id: user.id }),
        }).toString(),
      });

      if (!customerRes.ok) {
        const errText = await customerRes.text();
        throw new Error(`Stripe customer creation failed: ${errText}`);
      }

      const customer = await customerRes.json();
      customerId = customer.id;

      await supabase.from("tenants").update({ stripe_customer_id: customerId }).eq("id", tenant.id);
    }

    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: customerId,
        mode: "subscription",
        "payment_method_types[]": "card",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: success_url || "https://trustengine-mvp-8vxb.vercel.app/billing/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: cancel_url || "https://trustengine-mvp-8vxb.vercel.app/billing/cancel",
        "subscription_data[metadata][tenant_id]": tenant.id,
        "metadata[tenant_id]": tenant.id,
        "metadata[plan_type]": plan_type,
      }).toString(),
    });

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      throw new Error(`Stripe checkout session creation failed: ${errText}`);
    }

    const checkoutSession = await sessionRes.json();

    await supabase.from("billing_events").insert({
      tenant_id: tenant.id,
      event_type: "checkout_session_created",
      stripe_event_id: checkoutSession.id,
      payload: { plan_type, customer_id: customerId, url: checkoutSession.url },
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          checkout_url: checkoutSession.url,
          session_id: checkoutSession.id,
          customer_id: customerId,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("create-checkout-session error:", err);
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
