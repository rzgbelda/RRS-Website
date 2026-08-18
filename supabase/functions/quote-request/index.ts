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
      business_name,
      customer_type,
      contact_name,
      email,
      notes,
      requested_items,
      file_url,
      file_name,
      user_id,
      marketing_opt_in,
      shipping_street,
      shipping_city,
      shipping_state,
      shipping_zip,
    } = body;

    // ── 1. Save to Supabase ──────────────────────────────────────────────────
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const { data: row, error: dbErr } = await sb
      .from("quote_requests")
      .insert({
        user_id:          user_id          || null,
        business_name,
        customer_type:    customer_type    || null,
        contact_name:     contact_name     || null,
        email,
        notes:            notes            || null,
        requested_items:  requested_items  || null,
        file_url:         file_url         || null,
        file_name:        file_name        || null,
        marketing_opt_in: marketing_opt_in ?? true,
        shipping_street:  shipping_street  || null,
        shipping_city:    shipping_city    || null,
        shipping_state:   shipping_state   || null,
        shipping_zip:     shipping_zip     || null,
        status: "pending",
      })
      .select()
      .single();

    if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);

    // ── 2. Send email via Resend ─────────────────────────────────────────────
    if (RESEND_API_KEY) {
      const itemsSection = requested_items?.length
        ? `<h3 style="margin-top:20px;">Requested Products</h3>
           <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;width:100%;">
             <tr style="background:#f1f5f9;"><th align="left">Product</th><th align="center">Qty (cases)</th></tr>
             ${requested_items.map((i: any) => `<tr><td>${i.name}</td><td align="center">${i.quantity}</td></tr>`).join("")}
           </table>`
        : "";

      const fileSection = file_url
        ? `<p><strong>Attached file:</strong> <a href="${file_url}">${file_name}</a></p>`
        : "<p><em>No file attached.</em></p>";

      const shippingAddr = [shipping_street, shipping_city, shipping_state, shipping_zip].filter(Boolean).join(", ");

      const html = `
        <h2>New Business Pricing Request</h2>
        <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
          <tr><td><strong>Business Name</strong></td><td>${business_name}</td></tr>
          <tr><td><strong>Customer Type</strong></td><td>${customer_type || "—"}</td></tr>
          <tr><td><strong>Contact Name</strong></td><td>${contact_name}</td></tr>
          <tr><td><strong>Email</strong></td><td>${email}</td></tr>
          <tr><td><strong>Shipping Address</strong></td><td>${shippingAddr || "—"}</td></tr>
          <tr><td><strong>Notes</strong></td><td>${notes || "—"}</td></tr>
        </table>
        ${itemsSection}
        ${fileSection}
        <p style="margin-top:16px;color:#888;font-size:12px;">Submitted via RoomReadySupply.com · Request ID: ${row.id}</p>
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
          subject: `New Quote Request — ${business_name}`,
          html,
          reply_to: email,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true, id: row.id }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[quote-request] error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
