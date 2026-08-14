const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/**
 * Generates a branded quotation PDF and returns it as a real file download.
 *
 * The Download PDF button used to call window.print() and hand the customer
 * a print dialog to save from. This returns an actual file.
 *
 * The quote data is POSTed by the client rather than looked up here by id.
 * That is deliberate: the caller already had to be authorised to see the
 * quote in order to render it, so this endpoint never needs credentials and
 * can never be used to fetch someone else's quote by guessing an id -- it
 * only ever draws what it was handed.
 *
 * Visual language matches the order receipt in
 * supabase/functions/send-receipt (same navy masthead, orange rule, panel
 * fills and footer) so the two documents read as one family.
 */

const NAVY     = rgb(0.043, 0.122, 0.220);  // #0B1F38
const ORANGE   = rgb(0.929, 0.447, 0.149);  // #ED7226
const GRAY     = rgb(0.392, 0.447, 0.510);  // #647180
const GRAY_MID = rgb(0.553, 0.600, 0.655);  // #8D99A7
const PANEL    = rgb(0.949, 0.965, 0.980);  // #F2F6FA
const LINE     = rgb(0.886, 0.918, 0.945);  // #E2EAF1
const WHITE    = rgb(1, 1, 1);
const AMBER    = rgb(0.612, 0.345, 0.027);  // #9C5807
const AMBER_BG = rgb(0.996, 0.976, 0.933);  // #FEF9EE

const W = 612, H = 792;
const MARGIN = 44;
const RIGHT = W - MARGIN;
const FOOTER_H = 54;
const BODY_FLOOR = FOOTER_H + 34;

const money = n => '$' + (Number(n) || 0).toFixed(2);

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Truncate to fit a column, measured in real glyph widths rather than a guessed character count. */
function fitText(str, maxWidth, font, size) {
  let s = String(str == null ? '' : str);
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

/** Greedy wrap for the free-text custom message. */
function wrapText(str, maxWidth, font, size) {
  const words = String(str || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildQuotePdf(q) {
  // Defaults to 'Quotation' so /api/quote-pdf's existing behaviour is
  // completely unchanged; passing docLabel: 'Invoice' reuses the exact
  // same branded layout for a real order instead of duplicating ~300
  // lines of PDF layout code for a second document type.
  const docLabel = q.doc_label || 'Quotation';
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const rightOf = (text, edge, size, font) => edge - font.widthOfTextAtSize(text, size);

  const quoteNo   = String(q.quote_number || '—');
  const quoteDate = fmtDate(q.quoted_at || q.created_at) || fmtDate(Date.now());
  const validUntil = fmtDate(q.valid_until);
  const items = Array.isArray(q.quote_items) ? q.quote_items : [];

  const pages = [];
  let page, y;

  function drawHeader(p, continued) {
    p.drawRectangle({ x: 0, y: H - 104, width: W, height: 104, color: NAVY });
    p.drawRectangle({ x: 0, y: H - 108, width: W, height: 4, color: ORANGE });

    p.drawText('ROOM READY SUPPLY', { x: MARGIN, y: H - 44, size: 15, font: bold, color: ORANGE });
    p.drawText(continued ? `${docLabel} (continued)` : docLabel, {
      x: MARGIN, y: H - 62, size: 9.5, font: reg, color: WHITE,
    });
    p.drawText('609 Washington St, Plymouth, NC 27962', {
      x: MARGIN, y: H - 76, size: 8, font: reg, color: rgb(0.50, 0.62, 0.75),
    });

    const noText = quoteNo;
    p.drawText(noText, { x: rightOf(noText, RIGHT, 13, bold), y: H - 46, size: 13, font: bold, color: WHITE });
    p.drawText(quoteDate, { x: rightOf(quoteDate, RIGHT, 9, reg), y: H - 62, size: 9, font: reg, color: rgb(0.62, 0.73, 0.85) });

    return H - 108 - 26;
  }

  function drawFooter(p) {
    p.drawRectangle({ x: 0, y: 0, width: W, height: FOOTER_H, color: NAVY });
    p.drawRectangle({ x: 0, y: FOOTER_H, width: W, height: 3, color: ORANGE });
    p.drawText('Room Ready Supply  ·  609 Washington St, Plymouth, NC 27962', {
      x: MARGIN, y: 32, size: 7.5, font: reg, color: rgb(0.62, 0.73, 0.85),
    });
    p.drawText('(252) 227-0073  ·  sales@roomreadysupply.com  ·  roomreadysupply.com', {
      x: MARGIN, y: 20, size: 7.5, font: reg, color: rgb(0.62, 0.73, 0.85),
    });
    const t = 'Thank you for your business.';
    p.drawText(t, { x: rightOf(t, RIGHT, 7.5, reg), y: 26, size: 7.5, font: reg, color: rgb(0.50, 0.62, 0.75) });
  }

  function newPage(continued) {
    const p = doc.addPage([W, H]);
    pages.push(p);
    return { page: p, y: drawHeader(p, continued) };
  }

  /** Start a new page if `needed` points wouldn't fit above the footer. */
  function ensure(needed) {
    if (y - needed < BODY_FLOOR) {
      const n = newPage(true);
      page = n.page; y = n.y;
      return true;
    }
    return false;
  }

  ({ page, y } = newPage(false));

  // ── Validity pill ────────────────────────────────────────────────
  // Overridable for non-quote documents (e.g. an invoice showing order
  // status instead of a validity date); defaults preserve exact prior
  // behaviour for real quotes.
  const pillText = q.pill_text || (validUntil ? `VALID UNTIL ${validUntil.toUpperCase()}` : 'VALIDITY ON REQUEST');
  const pillW = bold.widthOfTextAtSize(pillText, 8) + 20;
  page.drawRectangle({ x: MARGIN, y: y - 17, width: pillW, height: 19, color: AMBER_BG, borderColor: rgb(0.949, 0.863, 0.682), borderWidth: 1 });
  page.drawText(pillText, { x: MARGIN + 10, y: y - 11, size: 8, font: bold, color: AMBER });
  y -= 30;

  // ── Prepared for ─────────────────────────────────────────────────
  const billLines = [
    q.business_name,
    q.contact_name,
    q.email,
    q.customer_type,
  ].filter(Boolean);

  const panelH = 24 + billLines.length * 12.5 + 8;
  page.drawRectangle({ x: MARGIN, y: y - panelH, width: RIGHT - MARGIN, height: panelH, color: PANEL, borderColor: LINE, borderWidth: 1 });
  page.drawText('PREPARED FOR', { x: MARGIN + 12, y: y - 15, size: 7.5, font: bold, color: GRAY_MID });
  let by = y - 29;
  billLines.forEach((line, i) => {
    page.drawText(fitText(line, RIGHT - MARGIN - 24, i === 0 ? bold : reg, i === 0 ? 10 : 9),
      { x: MARGIN + 12, y: by, size: i === 0 ? 10 : 9, font: i === 0 ? bold : reg, color: i === 0 ? NAVY : GRAY });
    by -= 12.5;
  });
  y -= panelH + 20;

  // ── Custom message ───────────────────────────────────────────────
  // Extracted into a function so it can run either here (default, before
  // the items table -- unchanged for every quote already using this
  // generator) or after the total (q.message_at_bottom), which keeps a
  // long message from pushing the items table and total apart onto
  // separate pages.
  function drawMessageBlock() {
    if (!q.quote_message) return;
    const msgLines = String(q.quote_message).split(/\n+/)
      .flatMap(para => wrapText(para, RIGHT - MARGIN - 26, reg, 9))
      .slice(0, 12);
    const msgH = 16 + msgLines.length * 12;
    ensure(msgH + 12);
    page.drawRectangle({ x: MARGIN, y: y - msgH, width: RIGHT - MARGIN, height: msgH, color: rgb(0.996, 0.980, 0.965) });
    page.drawRectangle({ x: MARGIN, y: y - msgH, width: 3, height: msgH, color: ORANGE });
    let my = y - 16;
    msgLines.forEach(line => {
      page.drawText(line, { x: MARGIN + 16, y: my, size: 9, font: reg, color: rgb(0.25, 0.31, 0.38) });
      my -= 12;
    });
    y -= msgH + 20;
  }

  if (!q.message_at_bottom) drawMessageBlock();

  // ── Items table ──────────────────────────────────────────────────
  const COL_QTY   = 348;
  const COL_PRICE = 448;
  const COL_TOTAL = RIGHT;

  function drawTableHead() {
    page.drawRectangle({ x: MARGIN, y: y - 20, width: RIGHT - MARGIN, height: 20, color: NAVY });
    page.drawText('PRODUCT', { x: MARGIN + 10, y: y - 13.5, size: 7.5, font: bold, color: rgb(0.62, 0.73, 0.85) });
    const q1 = 'QTY (CASES)', q2 = 'UNIT PRICE', q3 = 'TOTAL';
    page.drawText(q1, { x: rightOf(q1, COL_QTY, 7.5, bold), y: y - 13.5, size: 7.5, font: bold, color: rgb(0.62, 0.73, 0.85) });
    page.drawText(q2, { x: rightOf(q2, COL_PRICE, 7.5, bold), y: y - 13.5, size: 7.5, font: bold, color: rgb(0.62, 0.73, 0.85) });
    page.drawText(q3, { x: rightOf(q3, COL_TOTAL, 7.5, bold), y: y - 13.5, size: 7.5, font: bold, color: rgb(0.62, 0.73, 0.85) });
    y -= 20;
  }

  ensure(60);
  drawTableHead();

  let subtotal = 0;
  if (!items.length) {
    page.drawText('No line items on this quotation.', { x: MARGIN + 10, y: y - 15, size: 9, font: reg, color: GRAY_MID });
    y -= 26;
  } else {
    items.forEach((it, idx) => {
      const qty = Number(it.quantity) || 1;
      const unit = Number(it.unit_price) || 0;
      const line = qty * unit;
      subtotal += line;

      if (ensure(24)) drawTableHead();

      if (idx % 2 === 1) {
        page.drawRectangle({ x: MARGIN, y: y - 18, width: RIGHT - MARGIN, height: 18, color: rgb(0.980, 0.988, 0.996) });
      }
      const nameY = y - 12.5;
      page.drawText(fitText(it.name || 'Product', COL_QTY - MARGIN - 74, reg, 8.5),
        { x: MARGIN + 10, y: nameY, size: 8.5, font: reg, color: rgb(0.12, 0.18, 0.25) });
      const qs = String(qty), ps = money(unit), ts = money(line);
      page.drawText(qs, { x: rightOf(qs, COL_QTY, 8.5, reg), y: nameY, size: 8.5, font: reg, color: GRAY });
      page.drawText(ps, { x: rightOf(ps, COL_PRICE, 8.5, reg), y: nameY, size: 8.5, font: reg, color: GRAY });
      page.drawText(ts, { x: rightOf(ts, COL_TOTAL, 8.5, bold), y: nameY, size: 8.5, font: bold, color: NAVY });
      y -= 18;
    });
  }

  // In-house delivery fee: its own row so the customer can see what the
  // delivery portion of the total is, matching the emailed quote and the
  // customer-facing quote page.
  const deliveryFee = Math.max(0, Number(q.in_house_delivery_fee) || 0);
  if (deliveryFee > 0) {
    if (ensure(24)) drawTableHead();
    if (items.length % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - 18, width: RIGHT - MARGIN, height: 18, color: rgb(0.980, 0.988, 0.996) });
    }
    const nameY = y - 12.5;
    page.drawText(fitText('In-House Delivery', COL_QTY - MARGIN - 74, reg, 8.5),
      { x: MARGIN + 10, y: nameY, size: 8.5, font: reg, color: rgb(0.12, 0.18, 0.25) });
    const ds = money(deliveryFee);
    page.drawText('—', { x: rightOf('—', COL_QTY, 8.5, reg), y: nameY, size: 8.5, font: reg, color: GRAY });
    page.drawText('—', { x: rightOf('—', COL_PRICE, 8.5, reg), y: nameY, size: 8.5, font: reg, color: GRAY });
    page.drawText(ds, { x: rightOf(ds, COL_TOTAL, 8.5, bold), y: nameY, size: 8.5, font: bold, color: NAVY });
    y -= 18;
    subtotal += deliveryFee;
  }

  // ── Total ────────────────────────────────────────────────────────
  // grand_total already includes the delivery fee; the subtotal fallback
  // now does too, since the fee was added to it just above.
  const grand = q.grand_total != null ? Number(q.grand_total) : subtotal;
  ensure(46);
  y -= 6;
  page.drawRectangle({ x: MARGIN, y: y - 34, width: RIGHT - MARGIN, height: 34, color: NAVY });
  page.drawText('TOTAL', { x: MARGIN + 12, y: y - 15, size: 9.5, font: bold, color: WHITE });
  page.drawText('Before sales tax', { x: MARGIN + 12, y: y - 26, size: 7, font: reg, color: rgb(0.58, 0.71, 0.85) });
  const gt = money(grand);
  page.drawText(gt, { x: rightOf(gt, RIGHT - 12, 15, bold), y: y - 21, size: 15, font: bold, color: ORANGE });
  y -= 34 + 22;

  if (q.message_at_bottom) drawMessageBlock();

  // ── Terms ────────────────────────────────────────────────────────
  const terms = [
    'Prices shown are before sales tax; tax will be added at checkout or invoicing.',
    validUntil ? `Prices are per case and valid until ${validUntil}.` : 'Prices are per case.',
    ...(q.net_30_terms ? ['Payment terms: Net 30 days upon credit approval.'] : []),
    deliveryFee > 0
      ? 'Delivery is by Room Ready Supply and is included in the total above.'
      : 'Freight is additional unless otherwise noted.',
    'Minimum order quantities may apply.',
  ];
  ensure(20 + terms.length * 11 + 10);
  page.drawText('TERMS & CONDITIONS', { x: MARGIN, y: y, size: 7.5, font: bold, color: GRAY_MID });
  y -= 14;
  terms.forEach(t => {
    page.drawText('•', { x: MARGIN, y: y, size: 8, font: reg, color: ORANGE });
    page.drawText(fitText(t, RIGHT - MARGIN - 14, reg, 8), { x: MARGIN + 10, y: y, size: 8, font: reg, color: GRAY });
    y -= 11;
  });

  // Footers last, so page count is final
  pages.forEach((p, i) => {
    drawFooter(p);
    if (pages.length > 1) {
      const label = `Page ${i + 1} of ${pages.length}`;
      p.drawText(label, { x: rightOf(label, RIGHT, 7, reg), y: 62, size: 7, font: reg, color: GRAY_MID });
    }
  });

  return doc.save();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const q = req.body || {};
    if (!q.quote_number && !Array.isArray(q.quote_items)) {
      return res.status(400).json({ error: 'quote data is required' });
    }

    const bytes = await buildQuotePdf(q);
    const filename = `RRS-Quotation-${String(q.quote_number || 'quote').replace(/[^A-Za-z0-9._-]/g, '')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', bytes.length);
    return res.status(200).send(Buffer.from(bytes));
  } catch (err) {
    console.error('[quote-pdf] failed:', err);
    return res.status(500).json({ error: err.message || 'Could not generate PDF' });
  }
};

module.exports.buildQuotePdf = buildQuotePdf;
