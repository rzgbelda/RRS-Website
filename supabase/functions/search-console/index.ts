import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const GSC_SERVICE_ACCOUNT_B64 = Deno.env.get("GSC_SERVICE_ACCOUNT_B64") ?? "";
const SITE = "https://www.roomreadysupply.com/";
const TOKEN_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

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
  const json = atob(GSC_SERVICE_ACCOUNT_B64);
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

async function queryPerformance(accessToken: string, dimensions: string[], rowLimit: number, days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: fmt(start),
        endDate: fmt(end),
        dimensions,
        rowLimit,
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error("Search Analytics query failed: " + JSON.stringify(data));
  return data.rows || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    if (!GSC_SERVICE_ACCOUNT_B64) {
      throw new Error("GSC_SERVICE_ACCOUNT_B64 is not configured");
    }

    const accessToken = await getAccessToken();

    const [queries, pages] = await Promise.all([
      queryPerformance(accessToken, ["query"], 25, 28),
      queryPerformance(accessToken, ["page"], 15, 28),
    ]);

    const totals = queries.reduce(
      (acc: any, r: any) => {
        acc.clicks += r.clicks || 0;
        acc.impressions += r.impressions || 0;
        return acc;
      },
      { clicks: 0, impressions: 0 },
    );
    const avgPosition = queries.length
      ? queries.reduce((s: number, r: any) => s + (r.position || 0), 0) / queries.length
      : 0;

    return new Response(
      JSON.stringify({
        site: SITE,
        range_days: 28,
        totals: {
          clicks: totals.clicks,
          impressions: totals.impressions,
          ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
          avg_position: avgPosition,
        },
        queries: queries.map((r: any) => ({
          query: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        })),
        pages: pages.map((r: any) => ({
          page: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        })),
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[search-console] error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
