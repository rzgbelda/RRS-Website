import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHIPPO_API_KEY   = Deno.env.get("SHIPPO_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY") ?? "";

const ORIGIN = {
  name:    "Room Ready Supply",
  street1: "609 Washington St",
  city:    "Plymouth",
  state:   "NC",
  zip:     "27962",
  country: "US",
};

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendShippingEmail(opts: {
  customer_email: string;
  customer_name:  string;
  order_number:   string;
  tracking_number: string;
  tracking_url:   string | null;
  carrier:        string;
}) {
  const trackLink = opts.tracking_url || `https://tools.usps.com/go/TrackConfirmAction?tLabels=${opts.tracking_number}`;
  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
    <div style="background:#0B1F38;padding:28px 32px 22px;border-radius:12px 12px 0 0;">
      <p style="color:#ED7226;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin:0 0 6px;">Room Ready Supply</p>
      <h1 style="color:#fff;font-size:22px;margin:0 0 4px;">Your Order Has Shipped!</h1>
      <p style="color:rgba(255,255,255,.55);font-size:13px;margin:0;">Order #${opts.order_number}</p>
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px;">
      <p style="font-size:14.5px;color:#334155;line-height:1.6;margin:0 0 20px;">
        Hi ${opts.customer_name || "there"},<br><br>
        Great news — your order is on its way! Use the tracking information below to follow your shipment.
      </p>

      <div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 0;color:#64748b;font-weight:600;">Carrier</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#0B1F38;">${opts.carrier}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-weight:600;">Tracking Number</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#0B1F38;font-family:monospace;">${opts.tracking_number}</td>
          </tr>
        </table>
      </div>

      <a href="${trackLink}" style="display:block;text-align:center;background:#ED7226;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:14px 24px;border-radius:8px;margin-bottom:24px;">
        Track My Package &rarr;
      </a>

      <p style="font-size:13px;color:#94a3b8;margin:0;">
        Questions? Email us at <a href="mailto:sales@roomreadysupply.com" style="color:#0B1F38;font-weight:600;">sales@roomreadysupply.com</a>
        or call <strong>(252) 227-0073</strong>.
      </p>
    </div>
  </div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from:    "Room Ready Supply <orders@roomreadysupply.com>",
      // orders@ is not a monitored inbox -- the body already tells the
      // customer to email sales@, so Reply also needs to land there.
      reply_to: "sales@roomreadysupply.com",
      to:      [opts.customer_email],
      subject: `Your order #${opts.order_number} has shipped — ${opts.carrier}`,
      html,
    }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const {
      order_id,
      service_token,
      carrier_name,
      items,
      customer_name,
      street,
      city,
      state,
      zip,
    } = await req.json();

    if (!order_id || !service_token || !items?.length || !zip) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const PRODUCT_DIMS: Record<string, { weight_lbs: number; length_in: number; width_in: number; height_in: number }> = {};
    const DEFAULT = { weight_lbs: 20, length_in: 14, width_in: 12, height_in: 10 };

    const parcels = items.flatMap((item: any) => {
      const dims = PRODUCT_DIMS[item.itemNumber] || DEFAULT;
      const qty = item.quantity || 1;
      return Array.from({ length: qty }, () => ({
        length:        String(dims.length_in),
        width:         String(dims.width_in),
        height:        String(dims.height_in),
        distance_unit: "in",
        weight:        String(dims.weight_lbs),
        mass_unit:     "lb",
      }));
    });

    // 1. Create Shippo shipment with customer's real address
    const shipmentRes = await fetch("https://api.goshippo.com/shipments/", {
      method: "POST",
      headers: {
        "Authorization": `ShippoToken ${SHIPPO_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        address_from: ORIGIN,
        address_to: {
          name:    customer_name || "Customer",
          street1: street || "1 Main St",
          city:    city   || "",
          state:   state  || "",
          zip:     zip,
          country: "US",
        },
        parcels,
        async: false,
      }),
    });

    const shipment = await shipmentRes.json();
    if (!shipmentRes.ok) throw new Error(`Shippo shipment error: ${JSON.stringify(shipment)}`);

    // 2. Match the rate the customer selected
    const rates: any[] = shipment.rates || [];
    const matchedRate = rates.find((r: any) => r.servicelevel?.token === service_token)
      || rates.find((r: any) => (r.provider || "").toLowerCase() === (carrier_name || "").split(" ")[0].toLowerCase())
      || rates[0];

    if (!matchedRate) throw new Error("No matching rate found for selected service");

    // 3. Purchase the label
    const txRes = await fetch("https://api.goshippo.com/transactions/", {
      method: "POST",
      headers: {
        "Authorization": `ShippoToken ${SHIPPO_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        rate:            matchedRate.object_id,
        label_file_type: "PDF",
        async:           false,
      }),
    });

    const tx = await txRes.json();
    if (!txRes.ok) throw new Error(`Shippo transaction error: ${JSON.stringify(tx)}`);
    if (tx.status !== "SUCCESS") throw new Error(`Label purchase failed: ${tx.messages?.map((m: any) => m.text).join(", ")}`);

    const tracking_number  = tx.tracking_number;
    const label_url        = tx.label_url;
    const tracking_url     = tx.tracking_url_provider || null;
    const shipping_carrier = matchedRate.provider || carrier_name || null;

    // 4. Update order in Supabase
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const { error: updateErr } = await sb.from("orders").update({
      tracking_number,
      label_url,
      tracking_url,
      shipping_carrier,
      label_purchased_at: new Date().toISOString(),
      status: "processing",
    }).eq("id", order_id);

    if (updateErr) console.error("[purchase-label] DB update error:", updateErr.message);

    // 5. Send shipping confirmation email
    const { data: order } = await sb.from("orders").select("customer_email, customer_name, order_number").eq("id", order_id).single();
    if (order?.customer_email) {
      sendShippingEmail({
        customer_email:  order.customer_email,
        customer_name:   order.customer_name || customer_name || "",
        order_number:    order.order_number,
        tracking_number,
        tracking_url,
        carrier:         shipping_carrier || "Carrier",
      }).catch((err) => console.error("[purchase-label] shipping email error:", err));
    }

    return new Response(JSON.stringify({ tracking_number, label_url, tracking_url, carrier: shipping_carrier }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[purchase-label] error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
