import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

// Reuses the same service-account credential as supabase/functions/search-console
// (same JWT-signing pattern, different Google API + scope) -- the service
// account just also needs to be added as a Viewer on the GA4 property
// itself (Google Analytics > Admin > Property Access Management), which is
// a separate grant from Search Console access even though it's the same
// account. GA4_PROPERTY_ID is the numeric property id from GA4 Admin >
// Property Settings -- NOT the "G-XXXXXXX" measurement id already in the
// site's gtag snippet, which is a different identifier entirely.
const SERVICE_ACCOUNT_B64 = Deno.env.get("GSC_SERVICE_ACCOUNT_B64") ?? "";
const GA4_PROPERTY_ID = Deno.env.get("GA4_PROPERTY_ID") ?? "";
const TOKEN_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

function decodeKey(): ServiceAccountKey {
  const json = atob(SERVICE_ACCOUNT_B64);
  return JSON.parse(json);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const key = decodeKey();
  const cryptoKey = await importPrivateKey(key.private_key);

  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: key.client_email,
      scope: TOKEN_SCOPE,
      aud: key.token_uri,
      iat: getNumericDate(0),
      exp: getNumericDate(3600),
    },
    cryptoKey,
  );

  const res = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Token exchange failed: " + JSON.stringify(data));

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

async function runReport(accessToken: string, body: Record<string, unknown>) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error("GA4 report failed: " + JSON.stringify(data));
  return data;
}

// YYYY-MM-DD, validated loosely -- GA4 accepts "NdaysAgo"/"today" too, but
// this endpoint only ever receives real dates from the admin date pickers.
function isValidDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    if (!SERVICE_ACCOUNT_B64) throw new Error("GSC_SERVICE_ACCOUNT_B64 is not configured");
    if (!GA4_PROPERTY_ID) throw new Error("GA4_PROPERTY_ID is not configured");

    const url = new URL(req.url);
    const endDate = url.searchParams.get("end") || "today";
    const startDate = url.searchParams.get("start") || "28daysAgo";
    if (endDate !== "today" && !isValidDate(endDate)) throw new Error("Invalid end date");
    if (startDate !== "28daysAgo" && !isValidDate(startDate)) throw new Error("Invalid start date");

    const accessToken = await getAccessToken();
    const dateRanges = [{ startDate, endDate }];

    const [byPage, byDay] = await Promise.all([
      runReport(accessToken, {
        dateRanges,
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 100,
      }),
      runReport(accessToken, {
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
    ]);

    const pages = (byPage.rows || []).map((r: any) => ({
      path: r.dimensionValues[0].value,
      views: Number(r.metricValues[0].value),
      sessions: Number(r.metricValues[1].value),
    }));

    const totalViews = pages.reduce((s: number, p: any) => s + p.views, 0);
    const totalSessions = pages.reduce((s: number, p: any) => s + p.sessions, 0);

    const daily = (byDay.rows || []).map((r: any) => ({
      // GA4 returns date as "YYYYMMDD" with no separators
      date: r.dimensionValues[0].value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"),
      views: Number(r.metricValues[0].value),
    }));

    return new Response(
      JSON.stringify({
        range: { start: startDate, end: endDate },
        totals: { views: totalViews, sessions: totalSessions },
        pages,
        daily,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[analytics] error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
