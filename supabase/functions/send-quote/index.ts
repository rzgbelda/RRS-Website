import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")   ?? "";
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")     ?? "";
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RRS = {
  name:    "Room Ready Supply",
  address: "609 Washington St, Plymouth, NC 27962",
  phone:   "(252) 227-0073",
  email:   "hello@roomreadysupply.com",
  website: "www.roomreadysupply.com",
  logo_url: "https://www.roomreadysupply.com/RR%20logo.png",
};

function buildQuoteHtml(payload: {
  quote_number: string;
  quote_date:   string;
  valid_until:  string;
  customer: { business_name: string; contact_name: string; email: string; customer_type?: string };
  items: Array<{ name: string; quantity: number; unit_price: number }>;
  message?: string;
}) {
  const { quote_number, quote_date, valid_until, customer, items, message } = payload;
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const rows = items.map((i, idx) => {
    const line = i.quantity * i.unit_price;
    return `
      <tr style="background:${idx % 2 === 0 ? "#fff" : "#f8fafc"}">
        <td style="padding:12px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9">${i.name}</td>
        <td style="padding:12px 16px;font-size:13px;color:#475569;text-align:center;border-bottom:1px solid #f1f5f9">${i.quantity}</td>
        <td style="padding:12px 16px;font-size:13px;color:#475569;text-align:right;border-bottom:1px solid #f1f5f9">$${i.unit_price.toFixed(2)}</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#0d2c50;text-align:right;border-bottom:1px solid #f1f5f9">$${line.toFixed(2)}</td>
      </tr>`;
  }).join("");

  const msgBlock = message ? `
    <div style="margin:28px 0;padding:16px 20px;background:#fff7f0;border-left:4px solid #e8621a;border-radius:0 8px 8px 0">
      <p style="margin:0;font-size:13px;color:#334155;line-height:1.7">${message.replace(/\n/g, "<br>")}</p>
    </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote ${quote_number}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:700px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

  <!-- Header -->
  <div style="background:#0d2c50;padding:32px 40px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <img src="${RRS.logo_url}" alt="Room Ready Supply" style="height:72px;width:auto;max-width:200px;object-fit:contain;display:block">
    </div>
    <div style="text-align:right">
      <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:-.5px">QUOTATION</p>
      <p style="margin:4px 0 0;font-size:13px;color:#93c5fd;font-weight:600">${quote_number}</p>
    </div>
  </div>

  <!-- Orange accent bar -->
  <div style="height:4px;background:linear-gradient(90deg,#e8621a,#f59e0b)"></div>

  <!-- Meta row -->
  <div style="background:#f8fafc;padding:16px 40px;display:flex;gap:40px;border-bottom:1px solid #e2e8f0">
    <div>
      <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8">Quote Date</p>
      <p style="margin:3px 0 0;font-size:13px;font-weight:600;color:#1e293b">${quote_date}</p>
    </div>
    <div>
      <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8">Valid Until</p>
      <p style="margin:3px 0 0;font-size:13px;font-weight:600;color:#e8621a">${valid_until}</p>
    </div>
    <div>
      <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8">Prepared For</p>
      <p style="margin:3px 0 0;font-size:13px;font-weight:600;color:#1e293b">${customer.business_name}</p>
    </div>
  </div>

  <div style="padding:32px 40px">

    <!-- Bill To -->
    <div style="margin-bottom:28px;padding:20px 24px;border:1px solid #e2e8f0;border-radius:12px">
      <p style="margin:0 0 10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#e8621a">Bill To</p>
      <p style="margin:0;font-size:15px;font-weight:800;color:#0d2c50">${customer.business_name}</p>
      <p style="margin:3px 0 0;font-size:13px;color:#475569">${customer.contact_name}</p>
      <p style="margin:3px 0 0;font-size:13px;color:#475569">${customer.email}</p>
      ${customer.customer_type ? `<p style="margin:3px 0 0;font-size:12px;color:#94a3b8">${customer.customer_type}</p>` : ""}
    </div>

    ${msgBlock}

    <!-- Items table -->
    <table style="width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <thead>
        <tr style="background:#0d2c50">
          <th style="padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#93c5fd;text-align:left">Product</th>
          <th style="padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#93c5fd;text-align:center">Qty (cases)</th>
          <th style="padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#93c5fd;text-align:right">Unit Price</th>
          <th style="padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#93c5fd;text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#0d2c50">
          <td colspan="3" style="padding:14px 16px;font-size:13px;font-weight:700;color:#fff;text-align:right">TOTAL</td>
          <td style="padding:14px 16px;font-size:16px;font-weight:800;color:#f59e0b;text-align:right">$${subtotal.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Terms -->
    <div style="margin-top:24px;padding:16px 20px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">
      <p style="margin:0 0 6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#64748b">Terms & Conditions</p>
      <ul style="margin:0;padding-left:16px;font-size:12px;color:#64748b;line-height:1.8">
        <li>Prices are per case and valid until ${valid_until}.</li>
        <li>Payment terms: Net 30 days upon credit approval.</li>
        <li>Freight is additional unless otherwise noted.</li>
        <li>Minimum order quantities may apply.</li>
      </ul>
    </div>

  </div>

  <!-- Footer -->
  <div style="background:#0d2c50;padding:24px 40px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <p style="margin:0;font-size:12px;color:#93c5fd;font-weight:600">${RRS.name}</p>
      <p style="margin:3px 0 0;font-size:11px;color:#64748b">${RRS.address}</p>
    </div>
    <div style="text-align:right">
      <p style="margin:0;font-size:11px;color:#64748b">${RRS.phone}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#64748b">${RRS.email}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#64748b">${RRS.website}</p>
    </div>
  </div>

</div>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { quote_request_id, items, valid_until, message, preview_only } = body;

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // Fetch the quote request for customer info
    const { data: qr, error: qrErr } = await sb
      .from("quote_requests")
      .select("*")
      .eq("id", quote_request_id)
      .single();

    if (qrErr || !qr) throw new Error("Quote request not found");

    const quote_number = `RRS-${new Date().getFullYear()}-${String(qr.id).slice(0,6).toUpperCase()}`;
    const quote_date   = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const valid_until_fmt = new Date(valid_until).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const html = buildQuoteHtml({
      quote_number,
      quote_date,
      valid_until: valid_until_fmt,
      customer: {
        business_name: qr.business_name,
        contact_name:  qr.contact_name,
        email:         qr.email,
        customer_type: qr.customer_type,
      },
      items,
      message,
    });

    // Preview mode — just return the HTML
    if (preview_only) {
      return new Response(JSON.stringify({ html }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Send via Resend
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    `Room Ready Supply <hello@roomreadysupply.com>`,
        to:      [qr.email],
        subject: `Your Volume Pricing Quote — ${quote_number}`,
        html,
        reply_to: "hello@roomreadysupply.com",
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.json();
      throw new Error(err.message || "Failed to send email");
    }

    // Update status to quoted + save quote snapshot
    await sb.from("quote_requests").update({
      status: "quoted",
      quoted_at: new Date().toISOString(),
      quote_number,
      quote_items: items,
    }).eq("id", quote_request_id);

    return new Response(JSON.stringify({ success: true, quote_number }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[send-quote] error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
