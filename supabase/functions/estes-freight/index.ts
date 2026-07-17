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

  const authRes = await fetch(`${BASE}/v1/authenticate`, {
    method: "POST",
    headers: { "apiKey": ESTES_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ username: ESTES_USERNAME, password: ESTES_PASSWORD }),
  });

  const text = await authRes.text();
  console.log("[estes-freight] authenticate status:", authRes.status, text.slice(0, 300));

  if (!authRes.ok) throw new Error(`Estes auth error: ${authRes.status} — ${text.slice(0, 200)}`);
  const { access_token, expires_in } = JSON.parse(text);

  cachedToken = access_token;
  tokenExpiry = Date.now() + ((expires_in ?? 3600) - 60) * 1000;
  return cachedToken!;
}

function estesHeaders(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
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
    requestedShipDate: shipDate,
    serviceLevels: [{ code: "LTL" }],
    payor: {
      payorRole:    "Shipper",
      paymentTerms: "Prepaid",
      accountCode:  ESTES_ACCOUNT,
    },
    shipper: {
      postalCode:  ORIGIN.zip,
      countryCode: "US",
    },
    consignee: {
      postalCode:  payload.destination_zip,
      countryCode: "US",
    },
    commodities: [{
      weight:         Math.ceil(payload.weight_lbs),
      freightClass:   70,  // NMFC class 70 typical for hospitality supplies
      handlingUnits:  1,
    }],
  };

  console.log("[estes-freight] quote body:", JSON.stringify(body));

  const res = await fetch(`${BASE}/v1/rate-quotes`, {
    method: "POST",
    headers: estesHeaders(token),
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log("[estes-freight] quote response status:", res.status);

  if (!res.ok) {
    throw new Error(data?.errors?.[0]?.message ?? data?.message ?? `Rate quote failed (${res.status})`);
  }

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
        stateCode:  ORIGIN.state,
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
        stateCode:   payload.destination.state,
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
