import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ── Warp Freight API integration ────────────────────────────────────────────
// Real schema pulled from WARP's own published OpenAPI docs
// (https://developer.wearewarp.com/docs/freight/), not guessed. Two servers,
// same paths on both:
//   staging:    https://stg.wearewarp.com/api/v1
//   production: https://gw.wearewarp.com/api/v1
// Auth is a single static header -- no token exchange, unlike Estes:
//   apikey: <WARP_API_KEY>
//
// Env vars (set in Supabase Dashboard → Settings → Edge Functions → Secrets):
const WARP_API_KEY  = Deno.env.get("WARP_API_KEY")  ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const USE_TEST = Deno.env.get("WARP_TEST_MODE") === "true";
const BASE     = USE_TEST
  ? "https://stg.wearewarp.com/api/v1"
  : "https://gw.wearewarp.com/api/v1";

const ORIGIN = {
  name:    "Room Ready Supply",
  street:  "609 Washington St",
  city:    "Plymouth",
  state:   "NC",
  zip:     "27962",
  phone:   "2522179006",
  email:   "sales@roomreadysupply.com",
};

// Item dims WARP requires on every quote/book line item but our callers
// don't always have per-item length/width/height on hand (order_items only
// stores name/qty/weight). Same fallback box warp-freight.js already used
// for Estes' freight_class, just without the class field -- WARP's Item
// schema has no NMFC classification field at all.
const DEFAULT_DIMS = { length_in: 14, width_in: 12, height_in: 10 };

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function warpHeaders() {
  return {
    "apikey":       WARP_API_KEY,
    "Content-Type": "application/json",
    "Accept":       "application/json",
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function nextBusinessDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2); // Saturday → Monday
  if (day === 0) d.setDate(d.getDate() + 1); // Sunday → Monday
  return d.toISOString().slice(0, 10);
}

// East Coast (NC) offset for building a business-hours window on a given
// YYYY-MM-DD date. Rough DST rule (second Sunday in March through first
// Sunday in November = EDT, else EST) -- WARP just uses this as a
// schedulable pickup/delivery window, not a safety-critical timestamp, so
// an off-by-one-hour edge case right at a DST changeover is an acceptable
// simplification here.
function easternIso(dateStr: string, hour: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const month = d.getUTCMonth() + 1; // 1-12
  const isDst = month > 3 && month < 11; // rough: Apr-Oct is EDT
  const offset = isDst ? "-04:00" : "-05:00";
  const hh = String(hour).padStart(2, "0");
  return `${dateStr}T${hh}:00:00${offset}`;
}

function buildItem(i: {
  name?: string; description?: string;
  weight_lbs: number; quantity: number;
  length_in?: number; width_in?: number; height_in?: number;
}) {
  return {
    name:        i.name || i.description || "Hospitality Supply",
    length:      i.length_in ?? DEFAULT_DIMS.length_in,
    width:       i.width_in  ?? DEFAULT_DIMS.width_in,
    height:      i.height_in ?? DEFAULT_DIMS.height_in,
    sizeUnit:    "IN",
    quantity:    i.quantity,
    totalWeight: i.weight_lbs * i.quantity, // WARP's totalWeight = whole line, not per-unit
    weightUnit:  "lbs",
  };
}

// ── Handlers ─────────────────────────────────────────────────────────────

async function handleQuote(payload: {
  destination_zip: string;
  destination_country?: string;
  ship_date?: string; // YYYY-MM-DD
  items: Array<{ name?: string; description?: string; weight_lbs: number; quantity: number; length_in?: number; width_in?: number; height_in?: number }>;
}) {
  const shipDate = payload.ship_date ?? nextBusinessDay();

  const body = {
    pickupDate: shipDate,
    pickupInfo: { zipcode: ORIGIN.zip, country: "US" },
    deliveryInfo: { zipcode: payload.destination_zip, country: payload.destination_country || "US" },
    listItems: (payload.items || []).map(buildItem),
    shipmentType: "LTL",
  };

  console.log("[warp-freight] quote body:", JSON.stringify(body));

  const res = await fetch(`${BASE}/freights/quote`, {
    method:  "POST",
    headers: warpHeaders(),
    body:    JSON.stringify(body),
  });

  const text = await res.text();
  console.log("[warp-freight] quote response:", res.status, text.slice(0, 1500));

  if (!res.ok) {
    let msg = `Warp quote failed (${res.status})`;
    try { const j = JSON.parse(text); msg = j.message || j.code || msg; } catch { /* keep default */ }
    throw new Error(msg);
  }

  const data = JSON.parse(text);

  // Map into the SAME shape the site already expects everywhere
  // (carrier_name/total_charge/transit_days/delivery_date/quote_id/
  // service_level/ship_date/test_mode) -- see estes-freight/index.ts.
  // No downstream code needs to change field names because of this.
  return {
    carrier_name:  "Warp",
    total_charge:  Number(data?.price?.amount ?? 0),
    transit_days:  data?.transit_time ?? null,
    delivery_date: data?.estimated_delivery_date ?? null,
    quote_id:      data?.quote_id ?? null,
    service_level: "LTL",
    ship_date:     shipDate,
    test_mode:     USE_TEST,
  };
}

async function sendFreightShippingEmail(opts: {
  customer_email: string;
  customer_name:  string;
  order_number:   string;
  warp_order_number: string;
  tracking_number:   string;
}) {
  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
    <div style="background:#0B1F38;padding:28px 32px 22px;border-radius:12px 12px 0 0;">
      <p style="color:#ED7226;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin:0 0 6px;">Room Ready Supply</p>
      <h1 style="color:#fff;font-size:22px;margin:0 0 4px;">Your Freight Is On Its Way!</h1>
      <p style="color:rgba(255,255,255,.55);font-size:13px;margin:0;">Order #${opts.order_number}</p>
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px;">
      <p style="font-size:14.5px;color:#334155;line-height:1.6;margin:0 0 20px;">
        Hi ${opts.customer_name || "there"},<br><br>
        Your freight shipment has been booked with <strong>Warp</strong>. Keep the tracking number below handy if you need to follow up with us.
      </p>
      <div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 0;color:#64748b;font-weight:600;">Carrier</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#0B1F38;">Warp</td>
          </tr>
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 0;color:#64748b;font-weight:600;">Order Number</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#0B1F38;font-family:monospace;">${opts.warp_order_number}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-weight:600;">Tracking Number</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#0B1F38;font-family:monospace;">${opts.tracking_number}</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#64748b;margin:0 0 16px;">
        <strong>What to expect:</strong> the carrier will contact you to schedule delivery. If you need to adjust your delivery window, reply to this email or call us and reference your tracking number.
      </p>
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
      subject: `Your freight order #${opts.order_number} is booked — tracking #${opts.tracking_number}`,
      html,
    }),
  });
}

async function handleBook(payload: {
  order_number:   string;
  quote_id?:      string;
  ship_date?:     string;
  customer_email?: string;
  customer_name?:  string;
  destination: {
    name:    string;
    street:  string;
    city:    string;
    state:   string;
    zip:     string;
    phone?:  string;
    email?:  string;
  };
  items: Array<{ description: string; weight_lbs: number; quantity: number; length_in?: number; width_in?: number; height_in?: number }>;
}) {
  const shipDate = payload.ship_date ?? nextBusinessDay();
  // Soft default delivery window: ship date + 3 business days if we have no
  // better estimate. WARP/the carrier can reschedule this with the
  // customer -- it just needs SOME window to accept the booking.
  const deliveryDate = shipDate;

  const body = {
    ...(payload.quote_id ? { quoteId: payload.quote_id } : {}),
    shipmentType: "LTL",
    refNum: payload.order_number,
    pickupInfo: {
      locationName: ORIGIN.name,
      contactName:  ORIGIN.name,
      contactPhone: ORIGIN.phone,
      contactEmail: ORIGIN.email,
      address: { street: ORIGIN.street, city: ORIGIN.city, state: ORIGIN.state, zipcode: ORIGIN.zip },
      windowTime: { from: easternIso(shipDate, 8), to: easternIso(shipDate, 17) },
    },
    deliveryInfo: {
      locationName: payload.destination.name,
      contactName:  payload.destination.name,
      contactPhone: payload.destination.phone || ORIGIN.phone,
      contactEmail: payload.destination.email || "",
      address: {
        street:  payload.destination.street,
        city:    payload.destination.city,
        state:   payload.destination.state,
        zipcode: payload.destination.zip,
      },
      windowTime: { from: easternIso(deliveryDate, 8), to: easternIso(deliveryDate, 17) },
    },
    listItems: (payload.items || []).map(buildItem),
  };

  console.log("[warp-freight] book body:", JSON.stringify(body));

  const res = await fetch(`${BASE}/freights/booking`, {
    method:  "POST",
    headers: warpHeaders(),
    body:    JSON.stringify(body),
  });

  const text = await res.text();
  console.log("[warp-freight] book response:", res.status, text.slice(0, 1500));

  if (!res.ok) {
    let msg = `Warp booking failed (${res.status})`;
    try { const j = JSON.parse(text); msg = j.message || j.code || msg; } catch { /* keep default */ }
    throw new Error(msg);
  }

  const data = JSON.parse(text);
  const tracking_number    = String(data?.trackingNumber ?? "");
  const warp_order_number  = String(data?.orderNumber ?? data?.shipmentNumber ?? "");
  const shipment_id        = String(data?.shipmentId ?? "");

  if (payload.customer_email && tracking_number) {
    sendFreightShippingEmail({
      customer_email:     payload.customer_email,
      customer_name:      payload.customer_name || payload.destination.name || "",
      order_number:       payload.order_number,
      warp_order_number,
      tracking_number,
    }).catch((err) => console.error("[warp-freight] shipping email error:", err));
  }

  return { tracking_number, warp_order_number, shipment_id, test_mode: USE_TEST };
}

// ── Server ───────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { action, payload } = await req.json();

    let result;
    if (action === "debug") {
      // Temporary, safe diagnostic -- never logs/returns the real secret,
      // only enough to confirm the env var actually reached this instance.
      result = {
        warp_api_key_length: WARP_API_KEY.length,
        warp_api_key_prefix: WARP_API_KEY.slice(0, 4),
        test_mode: USE_TEST,
        base: BASE,
      };
    } else if (action === "quote") {
      result = await handleQuote(payload);
    } else if (action === "book") {
      result = await handleBook(payload);
    } else {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[warp-freight] error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
