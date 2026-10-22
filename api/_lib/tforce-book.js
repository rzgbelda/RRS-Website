// Admin "Book TForce" (order screen -> api/ups-tracking.js, action
// 'tforce_book'). One call books an LTL pickup from a supplier warehouse to
// the customer on RRS's TForce contract, billed third party (code 30):
// TForce creates the BOL and PRO, schedules the pickup and returns the BOL
// and 4x6 label PDFs (createBol in tforce.js).
//
// Then, for a real booking (not test):
//   - order_shipments gets the PRO as the customer-visible tracking row;
//   - the supplier is emailed the BOL + labels to print and attach.
// Every booking, test or real, is kept in freight_bookings with its PDFs.
//
// test=true goes to TForce's CIE test system: same documents and numbers,
// no real pickup, nothing recorded as customer tracking, no supplier email.

const { createBol } = require('./tforce');
const { Resend } = require('resend');

// order_shipments.distributor values (20261023b_tforce_bookings.sql).
const SHIPMENT_DISTRIBUTORS = ['innstyle', 'sasso', 'officecrave', 'starlinen', 'nps', 'imperial-brady', 'wraptite', 'bargoose'];
const CLASSES = ['50', '55', '60', '65', '70', '77.5', '85', '92.5', '100', '110', '125', '150', '175', '200', '250', '300', '400', '500'];
const TRACKING_URL = pro => `https://www.tforcefreight.com/ltl/apps/Tracking?proNumbers=${encodeURIComponent(pro)}`;

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function parseAddress(a) {
  if (!a) return null;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch (_) { return null; } }
  return a;
}

module.exports = async function bookTforce(req, res, staff) {
  const b = req.body || {};
  const sb = staff.supabase;
  const test = b.test !== false; // a booking is a test unless the form says otherwise

  const pallets = Math.floor(Number(b.pallets));
  const weightLb = Number(b.weight_lb);
  const freightClass = String(b.freight_class || '');
  const slug = String(b.distributor || '').trim().toLowerCase();
  const pickupDate = String(b.pickup_date || '');
  if (!b.order_id || !slug) return res.status(400).json({ error: 'order_id and distributor are required.' });
  if (!(pallets >= 1 && pallets <= 30)) return res.status(400).json({ error: 'Pallets must be 1-30.' });
  if (!(weightLb > 0 && weightLb < 20000)) return res.status(400).json({ error: 'Weight must be 1-19,999 lb (20,000+ is truckload; ask Bruce).' });
  if (!CLASSES.includes(freightClass)) return res.status(400).json({ error: 'Pick a valid freight class.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) return res.status(400).json({ error: 'Pickup date must be YYYY-MM-DD.' });

  const { data: order, error: orderErr } = await sb.from('orders')
    .select('id, order_number, customer_name, business_name, phone, customer_email, shipping_address')
    .eq('id', b.order_id).single();
  if (orderErr || !order) return res.status(404).json({ error: 'Order not found.' });
  const addr = parseAddress(order.shipping_address);
  if (!addr || !addr.street || !addr.city || !addr.state || !addr.zip) {
    return res.status(400).json({ error: 'The order has no complete shipping address.' });
  }
  const customerPhone = b.consignee_phone || order.phone;
  if (String(customerPhone || '').replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'The customer phone number is missing or incomplete; TForce requires one.' });
  }

  const { data: vendor } = await sb.from('vendors')
    .select('name, slug, contact_name, contact_email, contact_phone, ship_from_street, ship_from_city, ship_from_state, ship_from_zip')
    .eq('slug', slug).maybeSingle();
  if (!vendor || !vendor.ship_from_street || !vendor.ship_from_zip) {
    return res.status(400).json({ error: `No warehouse address on file for "${slug}".` });
  }
  const originPhone = b.origin_phone || vendor.contact_phone;
  if (String(originPhone || '').replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: `No phone number on file for ${vendor.name}; enter the warehouse phone in the form.` });
  }

  let r;
  try {
    r = await createBol({
      test,
      reference: order.order_number,
      liftgate: !!b.liftgate,
      residential: !!b.residential,
      shipFrom: {
        name: vendor.name, contact: 'SHIPPING', phone: originPhone,
        street: vendor.ship_from_street, city: vendor.ship_from_city, state: vendor.ship_from_state, zip: vendor.ship_from_zip,
      },
      shipTo: {
        name: order.business_name || order.customer_name || 'CUSTOMER', contact: order.customer_name || 'RECEIVING',
        phone: customerPhone, street: addr.street, city: addr.city, state: addr.state, zip: addr.zip,
      },
      freight: {
        pallets, weightLb, freightClass,
        nmfcPrime: b.nmfc_prime || null, nmfcSub: b.nmfc_sub || null,
        description: b.description,
      },
      pickup: { date: pickupDate, readyTime: b.ready_time, closeTime: b.close_time },
      requester: { contactName: staff.profile.email, email: 'sales@roomreadysupply.com', phone: '2526160088' },
    });
  } catch (err) {
    console.error('[tforce-book]', order.order_number, err.message);
    return res.status(502).json({ error: err.message });
  }

  // Real bookings only: customer-visible tracking, and the supplier's copy.
  let emailedTo = null;
  let emailError = null;
  if (!test) {
    const { error: shipErr } = await sb.from('order_shipments').insert({
      order_id: order.id,
      distributor: SHIPMENT_DISTRIBUTORS.includes(slug) ? slug : 'other',
      status: 'processing',
      tracking_number: r.pro,
      tracking_url: TRACKING_URL(r.pro),
      carrier: 'TForce Freight',
      note: `BOL ${r.bolId || ''} · pickup ${r.pickupConfirmation || 'not confirmed'} on ${pickupDate}`,
    });
    if (shipErr) console.error('[tforce-book] order_shipments insert failed:', shipErr.message);

    if (b.email_vendor !== false && vendor.contact_email && r.bolPdf) {
      try {
        if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
        const attachments = [{ filename: `BOL-${r.pro}.pdf`, content: r.bolPdf }];
        if (r.labelPdf) attachments.push({ filename: `Labels-${r.pro}.pdf`, content: r.labelPdf });
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: 'Room Ready Supply <orders@roomreadysupply.com>',
          reply_to: 'sales@roomreadysupply.com',
          to: vendor.contact_email,
          subject: `TForce pickup scheduled: PO ${order.order_number}, PRO ${r.pro}`,
          html: [
            `<p>Hi ${esc(vendor.name)} team,</p>`,
            `<p>TForce Freight will pick up PO <strong>${esc(order.order_number)}</strong> on <strong>${esc(pickupDate)}</strong>`,
            b.ready_time || b.close_time ? ` between ${esc(b.ready_time || '')} and ${esc(b.close_time || '')}` : '',
            `.</p><ul><li>PRO: <strong>${esc(r.pro)}</strong></li>`,
            r.pickupConfirmation ? `<li>Pickup confirmation: ${esc(r.pickupConfirmation)}</li>` : '',
            `<li>${pallets} pallet${pallets === 1 ? '' : 's'}, ${Math.round(weightLb)} lb</li></ul>`,
            '<p>Please print the attached bill of lading and put one label on each pallet. Freight is billed to Room Ready Supply (third party prepaid); there is nothing for you to pay.</p>',
            '<p>Questions: reply to this email or call (252) 616-0088.</p>',
            '<p style="color:#94a3b8;font-size:13px">Room Ready Supply &bull; 609 Washington St, Plymouth, NC 27962</p>',
          ].join(''),
          attachments,
        });
        emailedTo = vendor.contact_email;
      } catch (err) {
        emailError = err.message;
        console.error('[tforce-book] supplier email failed:', err.message);
      }
    }
  }

  const { data: saved, error: saveErr } = await sb.from('freight_bookings').insert({
    order_id: order.id,
    distributor: slug,
    environment: test ? 'cie' : 'prod',
    pro_number: r.pro,
    bol_id: r.bolId,
    pickup_confirmation: r.pickupConfirmation,
    origin_terminal: r.originTerminal,
    pickup_date: pickupDate,
    pallets,
    weight_lb: weightLb,
    freight_class: freightClass,
    liftgate: !!b.liftgate,
    quoted_total: r.quotedTotal,
    transit_days: r.transitDays,
    bol_pdf: r.bolPdf,
    label_pdf: r.labelPdf,
    emailed_to: emailedTo,
    request: r.request,
    created_by: staff.user.id,
  }).select('id').single();
  if (saveErr) console.error('[tforce-book] freight_bookings insert failed:', saveErr.message);

  return res.status(200).json({
    ok: true,
    environment: test ? 'cie' : 'prod',
    bookingId: saved ? saved.id : null,
    saveError: saveErr ? saveErr.message : null,
    pro: r.pro,
    bolId: r.bolId,
    pickupConfirmation: r.pickupConfirmation,
    pickupError: r.pickupError,
    originTerminal: r.originTerminal,
    quotedTotal: r.quotedTotal,
    transitDays: r.transitDays,
    emailedTo,
    emailError,
    bolPdf: r.bolPdf,
    labelPdf: r.labelPdf,
  });
};
