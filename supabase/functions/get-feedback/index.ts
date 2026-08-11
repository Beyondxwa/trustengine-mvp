import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type AIRow = {
  sentiment: string | null;
  coaching_advice: string | null;
  suggested_response: string | null;
  tags: unknown;
  cost_usd: number | null;
  model_used: string | null;
  created_at: string | null;
};

function mapAiAnalysis(row: AIRow | null | undefined, jsonbFallback: unknown) {
  if (row) {
    return {
      sentiment: row.sentiment,
      coaching_advice: row.coaching_advice,
      suggested_response: row.suggested_response,
      tags: Array.isArray(row.tags) ? row.tags : [],
      cost_usd: row.cost_usd ?? 0,
      model_used: row.model_used ?? "",
      created_at: row.created_at ?? "",
    };
  }
  if (jsonbFallback && typeof jsonbFallback === "object") {
    const j = jsonbFallback as Record<string, unknown>;
    return {
      sentiment: (j.sentiment as string) ?? null,
      coaching_advice: (j.coaching_advice as string) ?? "",
      suggested_response: (j.suggested_response as string) ?? "",
      tags: Array.isArray(j.tags) ? j.tags : [],
      cost_usd: typeof j.cost_usd === "number" ? j.cost_usd : 0,
      model_used: typeof j.model_used === "string" ? j.model_used : "",
      created_at: typeof j.created_at === "string" ? j.created_at : "",
    };
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  // Web inbox uses POST; mobile inbox uses GET with query params
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const accessToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: membership } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ success: false, error: "No tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Merge filters from POST body and GET query (web uses body; mobile uses query)
    let filters: Record<string, unknown> = {};
    const url = new URL(req.url);
    for (const [k, v] of url.searchParams.entries()) {
      filters[k] = v;
    }
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body === "object") filters = { ...filters, ...body };
      } catch {
        // empty body is fine
      }
    }

    const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 100);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const sortBy = typeof filters.sort_by === "string" ? filters.sort_by : "created_at";
    const sortOrder = filters.sort_order === "asc" ? true : false;
    const allowedSort = new Set(["created_at", "rating", "is_resolved"]);
    const orderCol = allowedSort.has(sortBy) ? sortBy : "created_at";

    // Canonical table is feedback_submissions (submit-feedback writes here)
    let query = supabase
      .from("feedback_submissions")
      .select(
        "id, tenant_id, rating, comment, selected_tags, is_resolved, created_at, customer_email, customer_phone, ai_analysis",
        { count: "exact" }
      )
      .eq("tenant_id", membership.tenant_id)
      .order(orderCol, { ascending: sortOrder })
      .range(offset, offset + limit - 1);

    if (filters.rating) query = query.eq("rating", Number(filters.rating));
    if (filters.status === "resolved" || filters.is_resolved === "true" || filters.is_resolved === true) {
      query = query.eq("is_resolved", true);
    }
    if (filters.status === "unresolved" || filters.is_resolved === "false" || filters.is_resolved === false) {
      query = query.eq("is_resolved", false);
    }
    if (typeof filters.search === "string" && filters.search.trim()) {
      const s = filters.search.trim().replace(/[%_,.()]/g, "");
      if (s) {
        query = query.or(
          `comment.ilike.%${s}%,customer_email.ilike.%${s}%,customer_phone.ilike.%${s}%`
        );
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = data || [];
    const ids = rows.map((r) => r.id);

    // Prefer ai_analyses table (what submit-feedback writes); fall back to JSONB column
    let analysesByFeedback: Record<string, AIRow> = {};
    if (ids.length > 0) {
      const { data: analyses } = await supabase
        .from("ai_analyses")
        .select("feedback_id, sentiment, coaching_advice, suggested_response, tags, cost_usd, model_used, created_at")
        .in("feedback_id", ids)
        .order("created_at", { ascending: false });

      if (analyses) {
        for (const a of analyses) {
          if (!analysesByFeedback[a.feedback_id]) {
            analysesByFeedback[a.feedback_id] = a;
          }
        }
      }
    }

    const mapped = rows.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      rating: row.rating,
      comment: row.comment,
      selected_tags: row.selected_tags,
      is_resolved: row.is_resolved,
      created_at: row.created_at,
      customer_email: row.customer_email,
      customer_phone: row.customer_phone,
      ai_analysis: mapAiAnalysis(analysesByFeedback[row.id], row.ai_analysis),
    }));

    const total = count ?? mapped.length;
    const hasMore = offset + mapped.length < total;

    return new Response(
      JSON.stringify({ success: true, data: mapped, total, hasMore, limit, offset }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("get-feedback error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
