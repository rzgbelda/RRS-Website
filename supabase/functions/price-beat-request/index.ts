import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")   ?? "";
const NOTIFY_EMAIL     = Deno.env.get("QUOTE_NOTIFY_EMAIL") ?? "sales@roomreadysupply.com";
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")     ?? "";
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const {
      contact_name,
      business_name,
      email,
      items,
      notes,
      affiliate_subdomain,
    } = body;

    if (!contact_name || !business_name || !email) {
      throw new Error("contact_name, business_name and email are required.");
    }
    const cleanItems = (Array.isArray(items) ? items : [])
      .map((i: any) => ({
        description:   String(i?.description ?? "").trim(),
        current_price: String(i?.current_price ?? "").trim(),
      }))
      .filter((i: any) => i.description)
      .slice(0, 3);
    if (!cleanItems.length) throw new Error("At least one item is required.");

    // ── 1. Save to Supabase ──────────────────────────────────────────────────
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // Same best-effort affiliate attribution as quote-request: the id is
    // looked up here from the subdomain, never accepted from the request
    // body, so a caller can't credit an affiliate that isn't theirs.
    let sub_distributor_id: string | null = null;
    const sub = String(affiliate_subdomain || "").trim().toLowerCase();
    if (sub) {
      const { data: aff, error: affErr } = await sb
        .from("sub_distributors")
        .select("id")
        .ilike("subdomain", sub)
        .eq("status", "active")
        .maybeSingle();
      if (affErr) console.error("[price-beat-request] affiliate lookup failed:", affErr.message);
      else if (aff) sub_distributor_id = aff.id;
    }

    const { data: row, error: dbErr } = await sb
      .from("price_beat_requests")
      .insert({
        contact_name,
        business_name,
        email,
        items:    cleanItems,
        notes:    notes || null,
        sub_distributor_id,
        status: "new",
      })
      .select()
      .single();

    if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);

    // ── 2. Send email via Resend ─────────────────────────────────────────────
    if (RESEND_API_KEY) {
      const itemsSection = `
        <h3 style="margin-top:20px;">Items To Beat</h3>
        <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;width:100%;">
          <tr style="background:#f1f5f9;"><th align="left">Item / Case / Pack Details</th><th align="left">Current Price</th></tr>
          ${cleanItems.map((i: any) => `<tr><td>${i.description}</td><td>${i.current_price || "—"}</td></tr>`).join("")}
        </table>`;

      const html = `
        <h2>New Price Beat Request</h2>
        <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
          <tr><td><strong>Business / Property</strong></td><td>${business_name}</td></tr>
          <tr><td><strong>Contact Name</strong></td><td>${contact_name}</td></tr>
          <tr><td><strong>Email</strong></td><td>${email}</td></tr>
          <tr><td><strong>Notes</strong></td><td>${notes || "—"}</td></tr>
        </table>
        ${itemsSection}
        <p style="margin-top:16px;color:#888;font-size:12px;">Submitted via RoomReadySupply.com/price-beat · Request ID: ${row.id}</p>
      `;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:    "Room Ready Supply <quotes@roomreadysupply.com>",
          to:      [NOTIFY_EMAIL],
          subject: `Price Beat Request — ${business_name}`,
          html,
          reply_to: email,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true, id: row.id }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[price-beat-request] error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
