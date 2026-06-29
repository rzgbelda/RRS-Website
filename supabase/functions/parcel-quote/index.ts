import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const SHIPPO_API_KEY = Deno.env.get("SHIPPO_API_KEY")!;

const ORIGIN = {
  name: "Room Ready Supply",
  street1: "609 Washington St",
  city: "Plymouth",
  state: "NC",
  zip: "27962",
  country: "US",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { destination_zip, destination_city, destination_state, items } = await req.json();

    if (!destination_zip || !items?.length) {
      return new Response(JSON.stringify({ error: "Missing destination_zip or items" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // One parcel per line item (accurate case-level dims)
    const parcels = items.flatMap((item: any) => {
      const qty = item.quantity || 1;
      return Array.from({ length: qty }, () => ({
        length: String(item.length_in || 14),
        width:  String(item.width_in  || 12),
        height: String(item.height_in || 10),
        distance_unit: "in",
        weight: String(item.weight_lbs || 20),
        mass_unit: "lb",
      }));
    });

    const payload = {
      address_from: ORIGIN,
      address_to: {
        name:     "Customer",
        street1:  "1 Main St",
        city:     destination_city  || "",
        state:    destination_state || "",
        zip:      destination_zip,
        country:  "US",
      },
      parcels,
      async: false,
    };

    console.log("[parcel-quote] payload:", JSON.stringify(payload));

    const res = await fetch("https://api.goshippo.com/shipments/", {
      method: "POST",
      headers: {
        "Authorization": `ShippoToken ${SHIPPO_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log("[parcel-quote] Shippo status:", res.status);

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Normalize and return rates sorted cheapest first
    const rates = (data.rates || [])
      .filter((r: any) => r.amount && parseFloat(r.amount) > 0)
      .map((r: any) => ({
        carrier_name:  `${r.provider} ${r.servicelevel?.name || ""}`.trim(),
        total_charge:  parseFloat(r.amount),
        transit_days:  r.estimated_days ?? null,
        service_token: r.servicelevel?.token ?? null,
      }))
      .sort((a: any, b: any) => a.total_charge - b.total_charge);

    return new Response(JSON.stringify({ rates }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[parcel-quote] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
