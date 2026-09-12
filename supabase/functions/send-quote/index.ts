import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "./require-staff.ts";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")   ?? "";
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")     ?? "";
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// US state sales tax rates, keyed by USPS two-letter code. Deno Edge
// Functions can't require() the site's shared tax-rates.js (that's for the
// browser pages and Vercel API routes), so this is a duplicate copy -- must
// be kept in sync with /tax-rates.js at the repo root if a rate ever
// changes. Tax is computed here, server-side, rather than trusted from the
// client payload: this is what actually gets emailed to the customer and
// snapshotted as the quote's official total, so it has to be right
// regardless of what the browser sent.
const TAX_RATES: Record<string, number> = {
  AL: 0.0400, AK: 0.0000, AZ: 0.0560, AR: 0.0650, CA: 0.0725,
  CO: 0.0290, CT: 0.0635, DE: 0.0000, FL: 0.0600, GA: 0.0400,
  HI: 0.0400, ID: 0.0600, IL: 0.0625, IN: 0.0700, IA: 0.0600,
  KS: 0.0650, KY: 0.0600, LA: 0.0500, ME: 0.0550, MD: 0.0600,
  MA: 0.0625, MI: 0.0600, MN: 0.0688, MS: 0.0700, MO: 0.0423,
  MT: 0.0000, NE: 0.0550, NV: 0.0685, NH: 0.0000, NJ: 0.0663,
  NM: 0.0488, NY: 0.0400, NC: 0.0475, ND: 0.0500, OH: 0.0575,
  OK: 0.0450, OR: 0.0000, PA: 0.0600, RI: 0.0700, SC: 0.0600,
  SD: 0.0420, TN: 0.0700, TX: 0.0625, UT: 0.0610, VT: 0.0600,
  VA: 0.0530, WA: 0.0650, WV: 0.0600, WI: 0.0500, WY: 0.0400,
};
function getTaxRate(stateCode?: string): number {
  return TAX_RATES[String(stateCode || "").trim().toUpperCase()] || 0;
}

// Unguessable token for the public /quote-confirm page -- same role as
// terms_token on terms_agreements (see api/send-terms-agreement.js): the
// link in the email IS the credential, since quote_requests holds
// customer PII and stays staff-only under RLS otherwise. 24 random bytes,
// base64url so it's URL-safe with no padding to escape.
function generateConfirmToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const RRS = {
  name:    "Room Ready Supply",
  address: "609 Washington St, Plymouth, NC 27962",
  phone:   "(252) 227-0073",
  email:   "sales@roomreadysupply.com",
  website: "www.roomreadysupply.com",
  logo_url: "https://www.roomreadysupply.com/assets/brand/RRS_LOGO_White.png",
};

function buildQuoteHtml(payload: {
  quote_number: string;
  quote_date:   string;
  valid_until:  string;
  customer: { business_name: string; contact_name: string; email: string; customer_type?: string; shipping_street?: string; shipping_city?: string; shipping_zip?: string };
  items: Array<{ name: string; quantity: number; unit_price: number }>;
  message?: string;
  net_30_terms?: boolean;
  in_house_delivery_fee?: number;
  freight_fee?: number;
  shipping_state?: string;
  confirm_url?: string;
  credit_amount?: number;
  credit_note?: string;
}) {
  const { quote_number, quote_date, valid_until, customer, items, message, net_30_terms, in_house_delivery_fee, freight_fee, shipping_state, confirm_url, credit_amount, credit_note } = payload;
  const itemsTotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const deliveryFee = Number(in_house_delivery_fee) || 0;
  const freightFee = Number(freight_fee) || 0;
  const subtotal = itemsTotal + deliveryFee + freightFee;
  const taxRate = getTaxRate(shipping_state);
  const tax = subtotal * taxRate;
  // Owner-issued credit, applied after tax so the tax figure quoted stays
  // the real tax on the goods. Clamped so a credit larger than the quote
  // shows a $0 total rather than a negative one.
  const credit = Math.max(0, Number(credit_amount) || 0);
  const grandTotal = Math.max(0, subtotal + tax - credit);

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
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote ${quote_number}</title><style>@media only screen and (max-width:600px){.rq-wrap{margin:0!important;border-radius:0!important}.rq-header{padding:20px 20px!important;flex-direction:column!important;align-items:flex-start!important;gap:14px!important}.rq-header-right{text-align:left!important}.rq-meta{padding:14px 20px!important;flex-wrap:wrap!important;gap:16px!important}.rq-body{padding:20px!important}.rq-addr{flex-direction:column!important}.rq-addr-card{min-width:0!important}.rq-table-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch}.rq-footer{padding:20px!important;flex-direction:column!important;align-items:flex-start!important;gap:14px!important}.rq-footer-right{text-align:left!important}}</style></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
<div class="rq-wrap" style="max-width:700px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

  <!-- Header -->
  <div class="rq-header" style="background:#0d2c50;padding:32px 40px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <img src="${RRS.logo_url}" alt="Room Ready Supply" style="height:72px;width:auto;max-width:200px;object-fit:contain;display:block">
    </div>
    <div class="rq-header-right" style="text-align:right">
      <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:-.5px">QUOTATION</p>
      <p style="margin:4px 0 0;font-size:13px;color:#93c5fd;font-weight:600">${quote_number}</p>
    </div>
  </div>

  <!-- Orange accent bar -->
  <div style="height:4px;background:linear-gradient(90deg,#e8621a,#f59e0b)"></div>

  <!-- Meta row -->
  <div class="rq-meta" style="background:#f8fafc;padding:16px 40px;display:flex;gap:40px;border-bottom:1px solid #e2e8f0">
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

  <div class="rq-body" style="padding:32px 40px">

    <!-- Bill To / Ship To -->
    <div class="rq-addr" style="margin-bottom:28px;display:flex;gap:20px;flex-wrap:wrap">
      <div class="rq-addr-card" style="flex:1;min-width:220px;padding:20px 24px;border:1px solid #e2e8f0;border-radius:12px">
        <p style="margin:0 0 10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#e8621a">Bill To</p>
        <p style="margin:0;font-size:15px;font-weight:800;color:#0d2c50">${customer.business_name}</p>
        <p style="margin:3px 0 0;font-size:13px;color:#475569">${customer.contact_name}</p>
        <p style="margin:3px 0 0;font-size:13px;color:#475569">${customer.email}</p>
        ${customer.customer_type ? `<p style="margin:3px 0 0;font-size:12px;color:#94a3b8">${customer.customer_type}</p>` : ""}
      </div>
      ${(customer.shipping_street || customer.shipping_city || shipping_state) ? `
      <div class="rq-addr-card" style="flex:1;min-width:220px;padding:20px 24px;border:1px solid #e2e8f0;border-radius:12px">
        <p style="margin:0 0 10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#e8621a">Ship To</p>
        ${customer.shipping_street ? `<p style="margin:0;font-size:13px;color:#475569">${customer.shipping_street}</p>` : ""}
        <p style="margin:3px 0 0;font-size:13px;color:#475569">${[customer.shipping_city, shipping_state, customer.shipping_zip].filter(Boolean).join(", ")}</p>
      </div>` : ""}
    </div>

    ${msgBlock}

    <!-- Items table -->
    <div class="rq-table-wrap">
    <table style="width:100%;min-width:480px;border-collapse:collapse;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <thead>
        <tr style="background:#0d2c50">
          <th style="padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#93c5fd;text-align:left">Product</th>
          <th style="padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#93c5fd;text-align:center">Qty (cases)</th>
          <th style="padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#93c5fd;text-align:right">Unit Price</th>
          <th style="padding:12px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#93c5fd;text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${rows}${deliveryFee > 0 ? `
        <tr style="background:${items.length % 2 === 0 ? "#fff" : "#f8fafc"}">
          <td style="padding:12px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9">
            In-House Delivery
            <span style="display:block;font-size:11px;color:#94a3b8;margin-top:2px">Delivered by Room Ready Supply</span>
          </td>
          <td style="padding:12px 16px;font-size:13px;color:#475569;text-align:center;border-bottom:1px solid #f1f5f9">—</td>
          <td style="padding:12px 16px;font-size:13px;color:#475569;text-align:right;border-bottom:1px solid #f1f5f9">—</td>
          <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#0d2c50;text-align:right;border-bottom:1px solid #f1f5f9">$${deliveryFee.toFixed(2)}</td>
        </tr>` : ""}${freightFee > 0 ? `
        <tr style="background:${(items.length + (deliveryFee > 0 ? 1 : 0)) % 2 === 0 ? "#fff" : "#f8fafc"}">
          <td style="padding:12px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9">
            Freight / Shipping
            <span style="display:block;font-size:11px;color:#94a3b8;margin-top:2px">Carrier freight for this order</span>
          </td>
          <td style="padding:12px 16px;font-size:13px;color:#475569;text-align:center;border-bottom:1px solid #f1f5f9">—</td>
          <td style="padding:12px 16px;font-size:13px;color:#475569;text-align:right;border-bottom:1px solid #f1f5f9">—</td>
          <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#0d2c50;text-align:right;border-bottom:1px solid #f1f5f9">$${freightFee.toFixed(2)}</td>
        </tr>` : ""}</tbody>
      <tfoot>
        <tr style="background:#f8fafc">
          <td colspan="3" style="padding:8px 16px;font-size:12px;color:#64748b;text-align:right;border-top:1px solid #e2e8f0">Subtotal</td>
          <td style="padding:8px 16px;font-size:13px;font-weight:700;color:#0d2c50;text-align:right;border-top:1px solid #e2e8f0">$${subtotal.toFixed(2)}</td>
        </tr>
        <tr style="background:#f8fafc">
          <td colspan="3" style="padding:8px 16px;font-size:12px;color:#64748b;text-align:right">Sales Tax${shipping_state ? ` (${shipping_state} · ${(taxRate * 100).toFixed(2)}%)` : ""}</td>
          <td style="padding:8px 16px;font-size:13px;font-weight:700;color:#0d2c50;text-align:right">$${tax.toFixed(2)}</td>
        </tr>
        ${credit > 0 ? `
        <tr style="background:#f8fafc">
          <td colspan="3" style="padding:8px 16px;font-size:12px;color:#64748b;text-align:right">Credit${credit_note ? ` (${credit_note})` : ""}</td>
          <td style="padding:8px 16px;font-size:13px;font-weight:700;color:#16a34a;text-align:right">&minus;$${credit.toFixed(2)}</td>
        </tr>` : ""}
        <tr style="background:#0d2c50">
          <td colspan="3" style="padding:14px 16px;font-size:13px;font-weight:700;color:#fff;text-align:right">TOTAL</td>
          <td style="padding:14px 16px;font-size:16px;font-weight:800;color:#f59e0b;text-align:right">$${grandTotal.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
    </div>

    ${confirm_url ? `
    <!-- Confirm This Order -->
    <div style="margin-top:24px;text-align:center">
      <a href="${confirm_url}" style="display:inline-block;padding:16px 40px;background:#e8621a;color:#fff;font-size:15px;font-weight:800;text-decoration:none;border-radius:10px;letter-spacing:.02em">
        Confirm This Order
      </a>
      <p style="margin:12px 0 0;font-size:12px;color:#94a3b8">Confirming lets us start preparing your order. We'll follow up with a payment link once it's confirmed.</p>
    </div>` : ""}

    <!-- Terms -->
    <div style="margin-top:24px;padding:16px 20px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">
      <p style="margin:0 0 6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#64748b">Terms & Conditions</p>
      <ul style="margin:0;padding-left:16px;font-size:12px;color:#64748b;line-height:1.8">
        <li>Sales tax is calculated based on the shipping state and included in the total above.</li>
        <li>Prices are per case and valid until ${valid_until}.</li>
        ${net_30_terms ? `<li>Payment terms: Net 30 days upon credit approval.</li>` : ""}
        ${deliveryFee > 0
          ? `<li>Delivery is by Room Ready Supply and is included in the total above.</li>`
          : freightFee > 0
            ? `<li>Freight is included in the total above.</li>`
            : `<li>Freight is additional unless otherwise noted.</li>`}
        <li>Minimum order quantities may apply.</li>
      </ul>
    </div>

  </div>

  <!-- Footer -->
  <div class="rq-footer" style="background:#0d2c50;padding:24px 40px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <p style="margin:0;font-size:12px;color:#93c5fd;font-weight:600">${RRS.name}</p>
      <p style="margin:3px 0 0;font-size:11px;color:#64748b">${RRS.address}</p>
    </div>
    <div class="rq-footer-right" style="text-align:right">
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
    // Staff only -- this emails a priced quote to a customer from our
    // sending domain. verify_jwt alone is satisfied by the public anon key.
    const staff = await requireStaff(req, CORS);
    if (!staff.ok) return staff.response;

    const body = await req.json();
    const { quote_request_id, items, message, preview_only, net_30_terms,
            fulfillment_method, in_house_delivery_fee, freight_fee, shipping_state } = body;
    const deliveryFee = Math.max(0, Number(in_house_delivery_fee) || 0);
    // Not gated on fulfillment_method the way deliveryFee is -- freight
    // only ever gets set on a 'ship' quote in practice (staff have no
    // reason to pull a Warp quote for an in-house delivery), but there's
    // no correctness reason to force it to 0 based on that flag the way
    // in-house delivery genuinely must be (can't bill both a carrier and
    // ourselves for the same shipment).
    const freightFee  = Math.max(0, Number(freight_fee) || 0);
    const isInHouse   = fulfillment_method === "in_house";
    let { valid_until } = body;

    // The admin composer already blocks sending without a state picked;
    // this is the server-side backstop so a real send can never go out
    // silently taxed at 0% because that client-side check was bypassed --
    // preview_only is exempt so staff can still preview before picking one.
    if (!preview_only && !shipping_state) {
      throw new Error("shipping_state is required to calculate sales tax");
    }

    // Belt-and-suspenders: the admin composer has a client-side guard that
    // blocks sending without a date, but a quote reached the database with
    // valid_until = null anyway. Rather than track down exactly how the
    // client-side check was bypassed for that one case, make it structurally
    // impossible here -- an invalid or missing date falls back to 10 days
    // from today, the current standard hold period (prices are moving with
    // fuel costs), instead of ever persisting null.
    if (!valid_until || isNaN(new Date(valid_until).getTime())) {
      const fallback = new Date();
      fallback.setDate(fallback.getDate() + 10);
      valid_until = fallback.toISOString().slice(0, 10);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // Fetch the quote request for customer info
    const { data: qr, error: qrErr } = await sb
      .from("quote_requests")
      .select("*")
      .eq("id", quote_request_id)
      .single();

    if (qrErr || !qr) throw new Error("Quote request not found");

    // Owner-issued credit (20260912b). Taken from the stored row rather
    // than the request body so a non-owner can't introduce one by crafting
    // a send-quote call. Older rows predate the column entirely.
    const creditAmount = Math.max(0, Number(qr.credit_amount) || 0);

    const quote_number = `RRS-${new Date().getFullYear()}-${String(qr.id).slice(0,6).toUpperCase()}`;
    const quote_date   = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const valid_until_fmt = new Date(valid_until).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    // Generated here (before the DB update further down) so buildQuoteHtml
    // can link the "Confirm This Order" button to it. Harmless to generate
    // even on a preview send -- it's pure randomness, no DB call -- but
    // the button itself only points at a real confirm link when this
    // isn't a preview (see confirm_url below), matching how every other
    // preview in this codebase (invoiceEmailHtml, terms-agreement) shows
    // '#preview-only' rather than a link that would actually work.
    const confirm_token = generateConfirmToken();
    const confirm_url = preview_only
      ? "#preview-only"
      : `https://www.roomreadysupply.com/quote-confirm?token=${confirm_token}`;

    const html = buildQuoteHtml({
      quote_number,
      quote_date,
      valid_until: valid_until_fmt,
      customer: {
        business_name: qr.business_name,
        contact_name:  qr.contact_name,
        email:         qr.email,
        customer_type: qr.customer_type,
        shipping_street: qr.shipping_street,
        shipping_city:    qr.shipping_city,
        shipping_zip:     qr.shipping_zip,
      },
      items,
      message,
      net_30_terms: !!net_30_terms,
      in_house_delivery_fee: isInHouse ? deliveryFee : 0,
      freight_fee: freightFee,
      shipping_state,
      confirm_url,
      // Read from the row, never from the request body -- only an owner can
      // set this (20260912b), so accepting it from the client would hand
      // anyone who can send a quote a way around that.
      credit_amount: creditAmount,
      credit_note: qr.credit_note || "",
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
        from:    `Room Ready Supply <sales@roomreadysupply.com>`,
        to:      [qr.email],
        subject: `Your Volume Pricing Quote — ${quote_number}`,
        html,
        reply_to: "sales@roomreadysupply.com",
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.json();
      throw new Error(err.message || "Failed to send email");
    }

    // Compute totals for snapshot. grand_total MUST include the in-house
    // delivery fee AND sales tax: api/send-invoice.js builds the Stripe
    // payment link from this number, so leaving either out here would
    // silently undercharge the customer. subtotal stays items-only (the
    // pre-existing, documented convention api/send-invoice.js relies on --
    // it recovers the item-only subtotal as total - deliveryFee) -- tax is
    // computed on items + delivery fee together, but only tax_amount and
    // grand_total reflect that, not subtotal itself. tax_rate/tax_amount
    // are snapshotted (not recomputed live wherever grand_total is
    // displayed later) so a future change to the site's rate table never
    // silently changes what an already-sent quote says it charged.
    const fee_amt      = isInHouse ? deliveryFee : 0;
    const subtotal_amt = items.reduce((s: number, i: any) => s + (i.quantity * i.unit_price), 0);
    const taxable_amt  = subtotal_amt + fee_amt + freightFee;
    const tax_rate      = getTaxRate(shipping_state);
    const tax_amt       = taxable_amt * tax_rate;
    // The credit comes off grand_total here so every downstream consumer
    // of that snapshot -- the confirm page, the order created on confirm,
    // and the Stripe payment link -- sees the discounted figure and agrees
    // with what the customer was emailed. Clamped at 0 so an over-credit
    // never produces a negative total.
    const grand_amt      = Math.max(0, taxable_amt + tax_amt - creditAmount);
    // confirm_token was already generated above (before buildQuoteHtml, so
    // the email's button could link to it) -- reused here, not
    // regenerated, so the token in the sent email matches the one saved
    // to the row. Resending an already-quoted request (e.g. a price
    // correction) does generate a fresh one on that later call, which
    // invalidates whichever link was in the earlier email -- consistent
    // with a resend replacing quote_items/grand_total wholesale too.

    // Update status to quoted + save full quote snapshot for customer portal.
    //
    // Some columns here may not exist live yet (freight_fee from 20260831c,
    // confirm_token from 20260912_quote_confirm.sql), so an attempt that
    // names a missing column is retried with that column dropped rather
    // than failing the whole send -- the email has already gone out by
    // this point, so refusing to record it would be strictly worse.
    //
    // The error code to look for is PGRST204, NOT Postgres's own 42703.
    // PostgREST returns 42703 for a SELECT naming a missing column, but
    // PGRST204 ("Could not find the 'x' column ... in the schema cache")
    // for an INSERT/UPDATE body naming one -- a different code for the
    // same underlying problem. This retry originally only checked 42703,
    // so it never fired on an update: every send emailed the customer a
    // quote while silently leaving the row at status='new' with no
    // quote_number and no confirm_token, which is what made every
    // "Confirm This Order" link 404 with "Quote not found".
    //
    // Built as one payload with optional keys deleted per attempt rather
    // than three near-identical object literals: the previous shape made
    // it easy for the retries to drift out of sync with the original.
    const MISSING_COL_CODES = ["PGRST204", "42703"];
    const OPTIONAL_COLS = ["freight_fee", "confirm_token"];

    const updatePayload: Record<string, unknown> = {
      status:           "quoted",
      quoted_at:        new Date().toISOString(),
      quote_number,
      quote_items:      items,
      valid_until:      valid_until.split("T")[0], // always set now -- see fallback above
      quote_message:    message || null,
      net_30_terms:     !!net_30_terms,
      fulfillment_method:    isInHouse ? "in_house" : "ship",
      in_house_delivery_fee: fee_amt,
      freight_fee:      freightFee,
      shipping_state:   shipping_state || null,
      tax_rate,
      tax_amount:       tax_amt,
      subtotal:         subtotal_amt,
      grand_total:      grand_amt,
      customer_visible: true,
      confirm_token:    confirm_token,
    };

    let updErr: { code?: string; message: string } | null = null;
    // At most one retry per optional column, plus the initial attempt.
    for (let attempt = 0; attempt <= OPTIONAL_COLS.length; attempt++) {
      ({ error: updErr } = await sb
        .from("quote_requests")
        .update(updatePayload)
        .eq("id", quote_request_id));

      if (!updErr) break;
      if (!MISSING_COL_CODES.includes(updErr.code ?? "")) break;

      // Drop whichever optional column this error named and try again.
      // Matching on the message rather than assuming an order means a
      // column becoming available (or a new one going missing) doesn't
      // silently strip the wrong field.
      const named = OPTIONAL_COLS.find(
        (col) => col in updatePayload && updErr!.message.includes(`'${col}'`),
      );
      if (!named) break;
      console.log(`[send-quote] '${named}' not in schema, retrying without it`);
      delete updatePayload[named];
    }

    if (updErr) console.error("[send-quote] quote_requests update failed:", updErr.code, updErr.message);

    // Read the row back rather than trusting updErr alone. Kept from the
    // debugging of the PGRST204 bug above: that failure mode emailed the
    // customer a real quote while the row silently stayed at status='new'
    // with no confirm_token, and nothing anywhere said so. This makes a
    // recurrence obvious in the logs on the very first send instead of
    // only surfacing later as a broken "Confirm This Order" link.
    const { data: savedRow } = await sb
      .from("quote_requests")
      .select("status, confirm_token")
      .eq("id", quote_request_id)
      .single();
    if (savedRow && (savedRow.status !== "quoted" || !savedRow.confirm_token)) {
      console.error(
        "[send-quote] WARNING: quote emailed but row not fully saved --",
        `status=${savedRow.status} confirm_token=${savedRow.confirm_token ? "set" : "null"}`,
        "-- the Confirm This Order link in that email will not work.",
      );
    }

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
