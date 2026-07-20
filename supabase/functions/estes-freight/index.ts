import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ── Env vars (set in Supabase Dashboard → Settings → Edge Functions → Secrets) ──
// ESTES_API_KEY: generate once via: curl -u client-id:client-secret -X POST https://cloudapi.estes-express.com/v1/api-key
// The POST response also returns a new client_secret — save that too but it's not needed here.
const ESTES_API_KEY  = Deno.env.get("ESTES_API_KEY")  ?? ""; // lifetime API key from Estes POST
const ESTES_USERNAME = Deno.env.get("ESTES_USERNAME")  ?? ""; // MyEstes username
const ESTES_PASSWORD = Deno.env.get("ESTES_PASSWORD")  ?? ""; // MyEstes password
const ESTES_ACCOUNT  = Deno.env.get("ESTES_ACCOUNT")   ?? ""; // Estes account number

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
  console.log("[estes-freight] quote response status:", res.status, "body:", rawQuote.slice(0, 500));

  if (!res.ok) {
    const data = JSON.parse(rawQuote);
    throw new Error(data?.errors?.[0]?.message ?? data?.message ?? `Rate quote failed (${res.status}) — ${rawQuote.slice(0, 300)}`);
  }
  const data = JSON.parse(rawQuote);

  // Response is an array of service level quotes
  const quotes: any[] = Array.isArray(data) ? data : [data];
  const q = quotes[0];

  return {
    carrier_name:   "Estes Express",
    total_charge:   Number(q?.totalCharges ?? q?.totalCharge ?? 0),
    transit_days:   q?.transitDays ?? null,
    delivery_date:  q?.deliveryDate ?? null,
    quote_id:       q?.quoteId ?? null,
    service_level:  q?.serviceLevel?.description ?? "LTL",
    ship_date:      shipDate,
    test_mode:      USE_TEST,
  };
}

async function handleBook(payload: {
  order_number:  string;
  quote_id?:     string;
  ship_date?:    string;
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

  return {
    bol_number: String(data?.bolNumber ?? data?.proNumber ?? data?.id ?? ""),
    pro_number: String(data?.proNumber ?? ""),
    test_mode:  USE_TEST,
  };
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
