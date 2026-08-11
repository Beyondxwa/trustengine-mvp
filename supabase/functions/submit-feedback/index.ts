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
// HELPERS
// ============================================
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================
// AI ANALYSIS VIA ANTHROPIC
// ============================================
async function analyzeFeedback(
  rating: number,
  comment: string | null,
  tags: string[],
  anthropicKey: string
): Promise<{
  sentiment: "positive" | "neutral" | "negative";
  coaching_advice: string;
  suggested_response: string;
  tags: string[];
  cost_usd: number;
  model_used: string;
}> {
  const model = "claude-3-5-sonnet-20241022";
  const prompt = `You are an expert customer success coach for small service businesses (auto detailers, salons, repair shops).

A customer left feedback:
- Star rating: ${rating}/5
- Selected tags: ${tags.join(", ") || "none"}
- Comment: ${comment || "No comment provided"}

Analyze this feedback and respond with a JSON object containing exactly these keys:
- "sentiment": one of "positive", "neutral", or "negative"
- "coaching_advice": 2-3 sentences of actionable advice for the business owner on how to improve or maintain service quality based on this feedback
- "suggested_response": a warm, professional response the business owner could send to the customer (keep under 100 words)
- "tags": an array of 1-3 concise category tags summarizing the feedback themes (e.g., ["wait_time", "cleanliness", "staff_friendliness"])

Respond ONLY with valid JSON. No markdown, no explanation.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errText}`);
  }

  const result = await response.json();
  const content = result.content?.[0]?.text ?? "";

  // Extract JSON from response (handle possible markdown fences)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : content;
  const parsed = JSON.parse(jsonStr);

  // Estimate cost: $3 / 1M input tokens, $15 / 1M output tokens for Sonnet
  // Rough estimate: 200 input + 150 output tokens
  const estimatedCost = (200 * 3 + 150 * 15) / 1_000_000;

  return {
    sentiment: parsed.sentiment,
    coaching_advice: parsed.coaching_advice,
    suggested_response: parsed.suggested_response,
    tags: parsed.tags,
    cost_usd: parseFloat(estimatedCost.toFixed(6)),
    model_used: model,
  };
}

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
    const jwtSecret = Deno.env.get("QR_JWT_SECRET");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── 1. Parse body ──
    let body: {
      token?: string;
      rating: number;
      selected_tags?: string[];
      comment?: string;
      nps_score?: number;
      customer_phone?: string;
      customer_email?: string;
    };

    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      token,
      rating,
      selected_tags = [],
      comment,
      nps_score,
      customer_phone,
      customer_email,
    } = body;

    // Validate required fields
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return new Response(
        JSON.stringify({ success: false, error: "Rating must be a number 1-5", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (nps_score !== undefined && (typeof nps_score !== "number" || nps_score < 0 || nps_score > 10)) {
      return new Response(
        JSON.stringify({ success: false, error: "NPS score must be 0-10", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let tenantId: string;
    let qrSessionId: string | null = null;

    // ── 2. Verify QR token (if provided) ──
    if (token) {
      if (!jwtSecret) {
        throw new Error("Missing QR_JWT_SECRET");
      }

      let payload: { session_id: string; tenant_id: string };
      try {
        const secret = new TextEncoder().encode(jwtSecret);
        const { payload: verifiedPayload } = await jwtVerify(token, secret, {
          clockTolerance: 30,
        });
        payload = verifiedPayload as any;
      } catch (err: any) {
        const message = err.code === "ERR_JWT_EXPIRED" ? "QR code has expired" : "Invalid QR code";
        const code = err.code === "ERR_JWT_EXPIRED" ? "SESSION_EXPIRED" : "INVALID_TOKEN";
        return new Response(
          JSON.stringify({ success: false, error: message, code }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify session exists (lookup by JWT session_id, not row id)
      const { data: session, error: sessionError } = await supabase
        .from("qr_sessions")
        .select("id, tenant_id, is_used, expires_at")
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

      if (new Date(session.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ success: false, error: "QR code has expired", code: "SESSION_EXPIRED" }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!session.is_used) {
        // Session was scanned but not marked used yet — mark it now
        await supabase
          .from("qr_sessions")
          .update({ is_used: true, used_at: new Date().toISOString() })
          .eq("id", session.id);
      }

      tenantId = session.tenant_id;
      qrSessionId = session.id;
    } else {
      // No token — direct feedback submission requires tenant_id in body
      return new Response(
        JSON.stringify({ success: false, error: "QR token is required", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Check suppression list (TCPA compliance) ──
    if (customer_phone) {
      const digitsOnly = customer_phone.replace(/\D/g, "");
      const phoneHash = await sha256(digitsOnly);

      const { data: suppressed, error: suppError } = await supabase
        .from("suppression_list")
        .select("id")
        .eq("phone_hash", phoneHash)
        .maybeSingle();

      if (suppError) {
        console.error("Suppression check error:", suppError);
      }

      if (suppressed) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "This phone number has opted out of communications",
            code: "SUPPRESSED",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── 4. Insert feedback submission ──
    const { data: feedback, error: feedbackError } = await supabase
      .from("feedback_submissions")
      .insert({
        tenant_id: tenantId,
        qr_session_id: qrSessionId,
        customer_phone: customer_phone || null,
        customer_email: customer_email || null,
        rating,
        selected_tags: selected_tags.filter((t) => typeof t === "string"),
        comment: comment || null,
        nps_score: nps_score ?? null,
        is_resolved: false,
        resolution_type: "none",
        review_platform: "none",
        on_site_verified: false,
      })
      .select("id, tenant_id, rating, comment, selected_tags")
      .single();

    if (feedbackError || !feedback) {
      console.error("Feedback insert error:", feedbackError);
      throw new Error("Failed to save feedback");
    }

    // ── 5. Run AI analysis (if Anthropic key available) ──
    let aiResult: Awaited<ReturnType<typeof analyzeFeedback>> | null = null;
    let aiAnalysisId: string | null = null;

    if (anthropicKey) {
      try {
        aiResult = await analyzeFeedback(rating, comment || null, selected_tags, anthropicKey);

        const { data: aiRow, error: aiError } = await supabase
          .from("ai_analyses")
          .insert({
            feedback_id: feedback.id,
            tenant_id: tenantId,
            sentiment: aiResult.sentiment,
            coaching_advice: aiResult.coaching_advice,
            suggested_response: aiResult.suggested_response,
            tags: aiResult.tags,
            cost_usd: aiResult.cost_usd,
            model_used: aiResult.model_used,
          })
          .select("id")
          .single();

        if (!aiError && aiRow) {
          aiAnalysisId = aiRow.id;
        }
      } catch (aiErr: any) {
        console.error("AI analysis failed (non-fatal):", aiErr.message);
        // Continue without AI analysis — feedback is still saved
      }
    }

    // ── 6. Update tenant monthly review count ──
    const { error: countError } = await supabase.rpc("increment_review_count", {
      p_tenant_id: tenantId,
    });

    if (countError) {
      // Fallback: non-atomic read-modify-write if the RPC is unavailable
      const { data: tenantRow, error: readError } = await supabase
        .from("tenants")
        .select("review_count_monthly")
        .eq("id", tenantId)
        .single();

      if (!readError && tenantRow) {
        const { error: fallbackError } = await supabase
          .from("tenants")
          .update({ review_count_monthly: (tenantRow.review_count_monthly ?? 0) + 1 })
          .eq("id", tenantId);

        if (fallbackError) {
          console.error("Failed to increment review count:", countError, fallbackError);
        }
      } else {
        console.error("Failed to increment review count:", countError, readError);
      }
    }

    // ── 7. Create notification for negative feedback ──
    let notificationId: string | null = null;
    if (rating <= 2) {
      try {
        const { data: notifRow, error: notifErr } = await supabase
          .from("notifications")
          .insert({
            tenant_id: tenantId,
            type: "negative_alert",
            title: "🚨 Negative Feedback Alert",
            body: `A customer left a ${rating}-star review. ${comment ? `"${comment.slice(0, 80)}..."` : "No comment provided."}`,
            data: { feedback_id: feedback.id, rating },
            status: "pending",
          })
          .select("id")
          .single();

        if (!notifErr && notifRow) {
          notificationId = notifRow.id;
        }
      } catch (notifErr: any) {
        console.error("Notification insert failed (non-fatal):", notifErr.message);
      }
    }

    // ── 7b. Trigger SMS alert (reliable fire-and-forget) ──
    if (notificationId) {
      try {
        const smsPromise = fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms-alert`,
          {
            method: "POST",
            headers: {
              Authorization: req.headers.get("Authorization") || "",
              apikey: req.headers.get("apikey") || "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ notification_id: notificationId }),
          }
        );
        // Ensure the fetch completes even after handler returns response
        // @ts-ignore — EdgeRuntime is injected by Supabase's Deno runtime
        if (typeof EdgeRuntime !== "undefined") {
          // @ts-ignore
          EdgeRuntime.waitUntil(smsPromise);
        }
      } catch (smsTriggerErr: any) {
        console.error("SMS trigger failed (non-fatal):", smsTriggerErr.message);
      }
    }

    // ── 8. Determine next step for customer ──
    const isHappy = rating >= 4;
    let reviewPlatforms: { platform: string; url: string; is_primary: boolean }[] = [];

    if (isHappy) {
      const { data: platforms } = await supabase
        .from("review_platforms")
        .select("platform, url, is_primary")
        .eq("tenant_id", tenantId);

      reviewPlatforms = platforms ?? [];
    }

    // ── 9. Return response ──
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          feedback_id: feedback.id,
          rating,
          next_step: isHappy ? "review_platforms" : "internal_feedback",
          review_platforms: isHappy ? reviewPlatforms : [],
          ai_analysis: aiResult
            ? {
                sentiment: aiResult.sentiment,
                coaching_advice: aiResult.coaching_advice,
                suggested_response: aiResult.suggested_response,
              }
            : null,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("submit-feedback error:", err);
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
