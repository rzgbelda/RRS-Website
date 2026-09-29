const { createClient } = require('@supabase/supabase-js');
const requireStaff = require('./_lib/require-staff');

// UPS OAuth + Tracking API. Production base -- swap to
// https://wwwcie.ups.com for the CIE (test) environment while developing
// against sandbox credentials.
const UPS_BASE = 'https://onlinetools.ups.com';

let cachedToken = null; // { token, expiresAt } -- client-credentials tokens are valid ~1hr, no need to fetch one per request

async function getUpsToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const clientId = process.env.UPS_CLIENT_ID;
  const clientSecret = process.env.UPS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('UPS_CLIENT_ID / UPS_CLIENT_SECRET not configured');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const resp = await fetch(`${UPS_BASE}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`UPS token request failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

// Maps a UPS activity status type/description to this app's three-state
// order_shipments.status. UPS's status set is much richer (many exception
// codes); anything not clearly "delivered" is left as 'shipped' rather than
// guessed at, since a wrong 'delivered' would hide a real problem from staff.
function mapUpsStatusToShipmentStatus(currentStatus) {
  const type = (currentStatus?.type || '').toUpperCase();
  const description = (currentStatus?.description || '').toUpperCase();
  if (type === 'D' || description.includes('DELIVERED')) return 'delivered';
  return 'shipped';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const staff = await requireStaff(req, res);
  if (!staff) return; // guard already responded

  const { shipmentId } = req.body || {};
  if (!shipmentId) {
    res.status(400).json({ error: 'shipmentId is required' });
    return;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data: shipment, error: fetchErr } = await supabase
    .from('order_shipments')
    .select('id, tracking_number, carrier, status')
    .eq('id', shipmentId)
    .single();

  if (fetchErr || !shipment) {
    res.status(404).json({ error: 'Shipment not found' });
    return;
  }

  if (!shipment.tracking_number) {
    res.status(400).json({ error: 'Shipment has no tracking number' });
    return;
  }

  try {
    const token = await getUpsToken();
    const trackResp = await fetch(
      `${UPS_BASE}/api/track/v1/details/${encodeURIComponent(shipment.tracking_number)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          transId: shipmentId,
          transactionSrc: 'rrs-website',
        },
      }
    );

    if (!trackResp.ok) {
      const text = await trackResp.text();
      res.status(trackResp.status).json({ error: `UPS tracking request failed: ${text}` });
      return;
    }

    const trackData = await trackResp.json();
    const pkg = trackData?.trackResponse?.shipment?.[0]?.package?.[0];
    const currentStatus = pkg?.currentStatus;
    const deliveryDate = pkg?.deliveryDate?.[0]?.date; // YYYYMMDD, present once delivered

    const newStatus = mapUpsStatusToShipmentStatus(currentStatus);
    const update = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'delivered' && deliveryDate) {
      const y = deliveryDate.slice(0, 4), m = deliveryDate.slice(4, 6), d = deliveryDate.slice(6, 8);
      update.delivered_at = new Date(`${y}-${m}-${d}`).toISOString();
    }

    const { error: updateErr } = await supabase
      .from('order_shipments')
      .update(update)
      .eq('id', shipmentId);

    if (updateErr) {
      res.status(500).json({ error: updateErr.message });
      return;
    }

    res.status(200).json({
      status: newStatus,
      upsDescription: currentStatus?.description || null,
      deliveredAt: update.delivered_at || null,
    });
  } catch (err) {
    console.error('[ups-tracking] error:', err);
    res.status(500).json({ error: err.message || 'UPS tracking lookup failed' });
  }
};
