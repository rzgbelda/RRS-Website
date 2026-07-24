import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHIPPO_API_KEY   = Deno.env.get("SHIPPO_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    // Build parcels from cart items (same logic as parcel-quote)
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

    // 1. Create a new Shippo shipment with the customer's real address
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

    // 2. Find the rate matching the service token the customer selected
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

    // 4. Update the order record in Supabase
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
