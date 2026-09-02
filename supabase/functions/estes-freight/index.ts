import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ── Env vars (set in Supabase Dashboard → Settings → Edge Functions → Secrets) ──
// ESTES_API_KEY: generate once via: curl -u client-id:client-secret -X POST https://cloudapi.estes-express.com/v1/api-key
// The POST response also returns a new client_secret — save that too but it's not needed here.
const ESTES_API_KEY  = Deno.env.get("ESTES_API_KEY")  ?? ""; // lifetime API key from Estes POST
const ESTES_USERNAME = Deno.env.get("ESTES_USERNAME")  ?? ""; // MyEstes username
const ESTES_PASSWORD = Deno.env.get("ESTES_PASSWORD")  ?? ""; // MyEstes password
const ESTES_ACCOUNT  = Deno.env.get("ESTES_ACCOUNT")   ?? ""; // Estes account number
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")  ?? "";

const USE_TEST = Deno.env.get("ESTES_TEST_MODE") === "true";
const BASE     = USE_TEST
  ? "https://uat-cloudapi.estes-express.com"
  : "https://cloudapi.estes-express.com";

const ORIGIN = {
  name:    "Room Ready Supply",
  street:  "609 Washington St",
  city:    "Plymouth",
  state:   "NC",
  zip:     "27962",
  phone:   "2522179006",
};

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Token cache (in-memory, per cold start) ─────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  console.log("[estes-freight] apiKey prefix:", ESTES_API_KEY.slice(0, 8), "length:", ESTES_API_KEY.length);

  const authRes = await fetch(`${BASE}/authenticate`, {
    method: "POST",
    headers: { "apiKey": ESTES_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ username: ESTES_USERNAME, password: ESTES_PASSWORD }),
  });

  const text = await authRes.text();
  console.log("[estes-freight] authenticate status:", authRes.status, "body:", text.slice(0, 500));

  if (!authRes.ok) throw new Error(`Estes auth error: ${authRes.status} — ${text.slice(0, 300)}`);

  const parsed = JSON.parse(text);
  // Estes may return access_token, token, or accessToken
  const token = parsed.access_token ?? parsed.token ?? parsed.accessToken ?? null;
  const expiresIn = parsed.expires_in ?? parsed.expiresIn ?? 3600;

  console.log("[estes-freight] token fields:", Object.keys(parsed), "token present:", !!token);

  if (!token) throw new Error(`Estes auth: no token in response — ${text.slice(0, 300)}`);

  cachedToken = token;
  tokenExpiry = Date.now() + (expiresIn - 60) * 1000;
  return cachedToken!;
}

function estesHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "apiKey":        ESTES_API_KEY,
    "Content-Type":  "application/json",
    "Accept":        "application/json",
  };
}

// ── Handlers ────────────────────────────────────────────────────────────────
async function handleQuote(payload: {
  destination_zip: string;
  destination_city?: string;
  destination_state?: string;
  weight_lbs: number;
  ship_date?: string; // YYYY-MM-DD
}) {
  const token = await getToken();
  const shipDate = payload.ship_date ?? nextBusinessDay();

  const body = {
    quoteRequest: {
      shipDate:      shipDate,
      serviceLevels: ["LTL"],
    },
    payment: {
      account: ESTES_ACCOUNT,
      payor:   "Shipper",
      terms:   "Prepaid",
    },
    origin: {
      address: {
        city:          ORIGIN.city,
        stateProvince: ORIGIN.state,
        postalCode:    ORIGIN.zip,
        country:       "US",
      },
    },
    destination: {
      address: {
        city:          payload.destination_city ?? "",
        stateProvince: payload.destination_state ?? "",
        postalCode:    payload.destination_zip,
        country:       "US",
      },
    },
    commodity: {
      handlingUnits: [{
        weight:    Math.ceil(payload.weight_lbs),
        count:     1,
        lineItems: [{
          weight:         Math.ceil(payload.weight_lbs),
          classification: 70,
        }],
      }],
    },
  };

  console.log("[estes-freight] quote body:", JSON.stringify(body));

  const res = await fetch(`${BASE}/v1/rate-quotes`, {
    method: "POST",
    headers: estesHeaders(token),
    body: JSON.stringify(body),
  });

  const rawQuote = await res.text();
  console.log("[estes-freight] quote response status:", res.status, "body:", rawQuote.slice(0, 2000));

  if (!res.ok) {
    const data = JSON.parse(rawQuote);
    throw new Error(data?.errors?.[0]?.message ?? data?.message ?? `Rate quote failed (${res.status}) — ${rawQuote.slice(0, 300)}`);
  }
  const data = JSON.parse(rawQuote);

  // Estes returns { data: [ { serviceLevelId, quoteId, charges: {...}, ... } ] }
  const quotes: any[] = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : [data]);
  const q = quotes[0];
  console.log("[estes-freight] quote[0] keys:", Object.keys(q ?? {}), "charges:", JSON.stringify(q?.charges ?? q?.pricing ?? q?.rate ?? "none"));

  const quoteRate = q?.quoteRate ?? {};
  const totalCharge = Number(quoteRate?.totalCharges ?? 0);
  const transitDays  = q?.transitDetails?.transitDays ?? null;
  const deliveryDate = q?.dates?.transitDeliveryDate ?? null;

  return {
    carrier_name:   "Estes Express",
    total_charge:   totalCharge,
    transit_days:   transitDays,
    delivery_date:  deliveryDate,
    quote_id:       q?.quoteId ?? null,
    service_level:  q?.serviceLevelText ?? q?.serviceLevel?.description ?? "LTL Standard Transit",
    ship_date:      shipDate,
    test_mode:      USE_TEST,
  };
}

async function sendFreightShippingEmail(opts: {
  customer_email: string;
  customer_name:  string;
  order_number:   string;
  bol_number:     string;
  pro_number:     string;
}) {
  const trackLink = `https://www.estes-express.com/myestes/tracking/shipment?type=PRO&value=${opts.pro_number}`;
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
        Your freight shipment has been booked with <strong>Estes Express</strong>. Use the PRO number below to track your delivery.
      </p>

      <div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 0;color:#64748b;font-weight:600;">Carrier</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#0B1F38;">Estes Express</td>
          </tr>
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 0;color:#64748b;font-weight:600;">BOL Number</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#0B1F38;font-family:monospace;">${opts.bol_number}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-weight:600;">PRO (Tracking) Number</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#0B1F38;font-family:monospace;">${opts.pro_number}</td>
          </tr>
        </table>
      </div>

      <a href="${trackLink}" style="display:block;text-align:center;background:#ED7226;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:14px 24px;border-radius:8px;margin-bottom:24px;">
        Track My Freight &rarr;
      </a>

      <p style="font-size:13px;color:#64748b;margin:0 0 16px;">
        <strong>What to expect:</strong> Estes will contact you to schedule delivery. If you need a liftgate or have a specific delivery window, call Estes at <strong>1-866-378-3748</strong> and reference your PRO number.
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
      subject: `Your freight order #${opts.order_number} is booked — PRO #${opts.pro_number}`,
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
  items: Array<{ description: string; weight_lbs: number; quantity: number }>;
}) {
  const token = await getToken();
  const shipDate = payload.ship_date ?? nextBusinessDay();

  const body = {
    requestedPickupDate: shipDate,
    shipper: {
      accountCode: ESTES_ACCOUNT,
      name:        ORIGIN.name,
      address: {
        street:     ORIGIN.street,
        city:       ORIGIN.city,
        stateProvince:  ORIGIN.state,
        postalCode: ORIGIN.zip,
        countryCode:"US",
      },
      phone: ORIGIN.phone,
    },
    consignee: {
      name:    payload.destination.name,
      address: {
        street:      payload.destination.street,
        city:        payload.destination.city,
        stateProvince:   payload.destination.state,
        postalCode:  payload.destination.zip,
        countryCode: "US",
      },
      phone: payload.destination.phone ?? "",
    },
    billTo: {
      accountCode:  ESTES_ACCOUNT,
      paymentTerms: "Prepaid",
    },
    commodities: payload.items.map(i => ({
      description:  i.description,
      weight:       Math.ceil(i.weight_lbs),
      quantity:     i.quantity,
      freightClass: 70,
    })),
    referenceNumbers: [
      { type: "PO", value: payload.order_number },
    ],
    ...(payload.quote_id ? { quoteId: payload.quote_id } : {}),
  };

  console.log("[estes-freight] book body:", JSON.stringify(body));

  const res = await fetch(`${BASE}/v1/shipments`, {
    method: "POST",
    headers: estesHeaders(token),
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log("[estes-freight] book response status:", res.status);

  if (!res.ok) {
    throw new Error(data?.errors?.[0]?.message ?? data?.message ?? `BOL creation failed (${res.status})`);
  }

  const bol_number = String(data?.bolNumber ?? data?.proNumber ?? data?.id ?? "");
  const pro_number = String(data?.proNumber ?? "");

  // Send shipping confirmation email if customer email was provided
  if (payload.customer_email && pro_number) {
    sendFreightShippingEmail({
      customer_email: payload.customer_email,
      customer_name:  payload.customer_name || payload.destination.name || "",
      order_number:   payload.order_number,
      bol_number,
      pro_number,
    }).catch((err) => console.error("[estes-freight] shipping email error:", err));
  }

  return { bol_number, pro_number, test_mode: USE_TEST };
}

// ── Utilities ────────────────────────────────────────────────────────────────
function nextBusinessDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2); // Saturday → Monday
  if (day === 0) d.setDate(d.getDate() + 1); // Sunday → Monday
  return d.toISOString().slice(0, 10);
}

// ── Server ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { action, payload } = await req.json();

    let result;
    if (action === "quote") {
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
    console.error("[estes-freight] error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
