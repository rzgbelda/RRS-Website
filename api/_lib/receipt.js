// Customer order confirmation: the email + PDF receipt that the
// send-receipt Supabase function used to send when payment.html called it
// from the browser.
//
// Moved server-side (2026-10-13) for two reasons:
//  - The browser called send-receipt with the public key, so anyone could
//    make RRS send a branded "Order Confirmed" email with any content to
//    any address. api/create-order.js now sends it only for an order whose
//    payment Stripe itself confirmed, with product names from the database.
//  - The final update package requires the confirmation email to show the
//    delivery date range (Shipping Policy section 7), per supplier.
//
// Layout and wording follow supabase/functions/send-receipt/index.ts, with
// a Delivery line added: tax used to be derived as total - subtotal, which
// would show the delivery charge as tax.

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { Resend } = require('resend');

const NAVY = rgb(0.043, 0.122, 0.220);
const ORANGE = rgb(0.929, 0.447, 0.149);
const GRAY = rgb(0.392, 0.447, 0.510);
const GRAY_MID = rgb(0.553, 0.600, 0.655);
const LIGHT = rgb(0.973, 0.980, 0.988);
const PANEL = rgb(0.949, 0.965, 0.980);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0.118, 0.176, 0.220);
const BORDER = rgb(0.886, 0.910, 0.941);
const GREEN = rgb(0.086, 0.451, 0.235);
const GREEN_BG = rgb(0.925, 0.976, 0.945);
const AMBER = rgb(0.573, 0.329, 0.024);
const AMBER_BG = rgb(0.996, 0.965, 0.898);

const W = 612, H = 792, MARGIN = 44, RIGHT = W - MARGIN, FOOTER_H = 54, BODY_FLOOR = FOOTER_H + 34;

const money = n => '$' + Number(n || 0).toFixed(2);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fitText(str, maxWidth, font, size) {
  if (font.widthOfTextAtSize(str, size) <= maxWidth) return str;
  let s = str;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

// Standard PDF fonts only cover WinAnsi; anything else (e.g. "×" is fine,
// emoji are not) would throw mid-render.
function pdfSafe(s) {
  return String(s == null ? '' : s).replace(/[^\x20-\x7E -ÿ–—‘’“”…×]/g, '');
}

function statusOf(order) {
  if (order.payment_status === 'processing') return { label: 'PAYMENT PROCESSING', paid: false };
  if (order.payment_status === 'paid' || order.payment_status === 'authorized') return { label: 'PAYMENT RECEIVED', paid: true };
  return { label: 'AWAITING PAYMENT', paid: false };
}

function methodLabel(m) {
  return m === 'card' ? 'Credit / Debit Card' : m === 'ach' ? 'Bank Account (ACH)' : m === 'invoice' ? 'Invoice' : m === 'po' ? 'Purchase Order' : '—';
}

/**
 * order: { order_number, created_at, customer_name, business_name,
 *   customer_email, phone, shipping_address, payment_method, payment_status,
 *   items: [{ name, quantity, price }], subtotal, delivery, tax, total,
 *   deliveryRange }
 */
async function generateReceiptPdf(order) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);

  let logoImage = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch('https://www.roomreadysupply.com/RRS_LOGO_White_small.png', { signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) {
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length < 300000) logoImage = await doc.embedPng(bytes);
    }
  } catch (_) { /* wordmark fallback */ }

  const dateStr = new Date(order.created_at || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const orderNo = String(order.order_number || '—');
  const st = statusOf(order);
  const pages = [];

  function drawHeader(page, continued) {
    page.drawRectangle({ x: 0, y: H - 104, width: W, height: 104, color: NAVY });
    page.drawRectangle({ x: 0, y: H - 108, width: W, height: 4, color: ORANGE });
    const x = logoImage ? MARGIN + 78 : MARGIN;
    if (logoImage) {
      const d = logoImage.scale(64 / logoImage.width);
      page.drawImage(logoImage, { x: MARGIN, y: H - 86, width: d.width, height: d.height });
    }
    page.drawText('ROOM READY SUPPLY', { x, y: H - 44, size: logoImage ? 12.5 : 15, font: bold, color: logoImage ? WHITE : ORANGE });
    page.drawText(continued ? 'Receipt (continued)' : 'Order Receipt', { x, y: H - 60, size: 9.5, font: reg, color: rgb(0.62, 0.73, 0.85) });
    page.drawText('609 Washington St, Plymouth, NC 27962', { x, y: H - 74, size: 8, font: reg, color: rgb(0.50, 0.62, 0.75) });
    const noText = `Order #${pdfSafe(orderNo)}`;
    page.drawText(noText, { x: RIGHT - bold.widthOfTextAtSize(noText, 13), y: H - 46, size: 13, font: bold, color: WHITE });
    page.drawText(dateStr, { x: RIGHT - reg.widthOfTextAtSize(dateStr, 9), y: H - 62, size: 9, font: reg, color: rgb(0.62, 0.73, 0.85) });
    return H - 108 - 26;
  }

  function drawFooter(page) {
    page.drawRectangle({ x: 0, y: 0, width: W, height: FOOTER_H, color: NAVY });
    page.drawRectangle({ x: 0, y: FOOTER_H, width: W, height: 3, color: ORANGE });
    page.drawText('Room Ready Supply  ·  609 Washington St, Plymouth, NC 27962', { x: MARGIN, y: 32, size: 7.5, font: reg, color: rgb(0.62, 0.73, 0.85) });
    page.drawText('(252) 616-0088  ·  sales@roomreadysupply.com  ·  roomreadysupply.com', { x: MARGIN, y: 20, size: 7.5, font: reg, color: rgb(0.62, 0.73, 0.85) });
    const thanks = 'Thank you for your business.';
    page.drawText(thanks, { x: RIGHT - reg.widthOfTextAtSize(thanks, 7.5), y: 26, size: 7.5, font: reg, color: rgb(0.50, 0.62, 0.75) });
  }

  function newPage(continued) {
    const p = doc.addPage([W, H]);
    pages.push(p);
    const startY = drawHeader(p, continued);
    drawFooter(p);
    return { page: p, y: startY };
  }

  let { page, y } = newPage(false);
  function ensure(needed) {
    if (y - needed < BODY_FLOOR) { ({ page, y } = newPage(true)); return true; }
    return false;
  }
  const rightOf = (text, edge, size, font) => edge - font.widthOfTextAtSize(text, size);

  // Status pill
  {
    const fg = st.paid ? GREEN : AMBER, bg = st.paid ? GREEN_BG : AMBER_BG;
    const tw = bold.widthOfTextAtSize(st.label, 8.5);
    page.drawRectangle({ x: MARGIN, y: y - 6, width: tw + 22, height: 21, color: bg });
    page.drawRectangle({ x: MARGIN, y: y - 6, width: 3, height: 21, color: fg });
    page.drawText(st.label, { x: MARGIN + 12, y, size: 8.5, font: bold, color: fg });
    const shown = st.paid ? `Paid by ${methodLabel(order.payment_method)}` : `Payment method: ${methodLabel(order.payment_method)}`;
    page.drawText(shown, { x: rightOf(shown, RIGHT, 9, reg), y, size: 9, font: reg, color: GRAY });
    y -= 30;
  }

  // Bill to / Ship to
  {
    const addr = order.shipping_address || {};
    const left = [order.business_name, order.customer_name, order.customer_email, order.phone].map(pdfSafe).filter(Boolean);
    const right = [order.customer_name || order.business_name, addr.street, [addr.city, addr.state, addr.zip].filter(Boolean).join(', ')].map(pdfSafe).filter(Boolean);
    const rows = Math.max(left.length, right.length, 1);
    const panelH = 24 + rows * 12.5 + 8;
    ensure(panelH + 10);
    page.drawRectangle({ x: MARGIN, y: y - panelH + 16, width: RIGHT - MARGIN, height: panelH, color: PANEL });
    const colL = MARGIN + 16, colR = MARGIN + (RIGHT - MARGIN) / 2 + 8, colW = (RIGHT - MARGIN) / 2 - 30;
    page.drawText('BILL TO', { x: colL, y, size: 7.5, font: bold, color: GRAY_MID });
    page.drawText('SHIP TO', { x: colR, y, size: 7.5, font: bold, color: GRAY_MID });
    let ry = y - 15;
    for (let i = 0; i < rows; i++) {
      const f = i === 0 ? bold : reg, c = i === 0 ? BLACK : GRAY;
      if (left[i]) page.drawText(fitText(left[i], colW, f, 9), { x: colL, y: ry, size: 9, font: f, color: c });
      if (right[i]) page.drawText(fitText(right[i], colW, f, 9), { x: colR, y: ry, size: 9, font: f, color: c });
      ry -= 12.5;
    }
    y = y - panelH + 4;
  }

  // Items
  const items = Array.isArray(order.items) ? order.items : [];
  const COL_QTY = 392, COL_PRICE = 476, COL_SUB = RIGHT - 12, NAME_W = COL_QTY - (MARGIN + 12) - 46;
  function drawTableHead() {
    page.drawRectangle({ x: MARGIN, y: y - 6, width: RIGHT - MARGIN, height: 22, color: NAVY });
    page.drawText('PRODUCT', { x: MARGIN + 12, y, size: 7.5, font: bold, color: WHITE });
    page.drawText('QTY', { x: rightOf('QTY', COL_QTY, 7.5, bold), y, size: 7.5, font: bold, color: WHITE });
    page.drawText('UNIT PRICE', { x: rightOf('UNIT PRICE', COL_PRICE, 7.5, bold), y, size: 7.5, font: bold, color: WHITE });
    page.drawText('AMOUNT', { x: rightOf('AMOUNT', COL_SUB, 7.5, bold), y, size: 7.5, font: bold, color: WHITE });
    y -= 22;
  }
  ensure(70);
  drawTableHead();
  if (!items.length) {
    page.drawRectangle({ x: MARGIN, y: y - 6, width: RIGHT - MARGIN, height: 22, color: LIGHT });
    page.drawText('Item detail is available in your account at roomreadysupply.com', { x: MARGIN + 12, y, size: 8.5, font: reg, color: GRAY_MID });
    y -= 26;
  }
  items.forEach((item, i) => {
    if (ensure(26)) drawTableHead();
    if (i % 2 === 0) page.drawRectangle({ x: MARGIN, y: y - 5, width: RIGHT - MARGIN, height: 18, color: LIGHT });
    const qty = Number(item.quantity) || 1, price = Number(item.price) || 0;
    page.drawText(fitText(pdfSafe(item.name || 'Product'), NAME_W, reg, 9), { x: MARGIN + 12, y, size: 9, font: reg, color: BLACK });
    page.drawText(String(qty), { x: rightOf(String(qty), COL_QTY, 9, reg), y, size: 9, font: reg, color: GRAY });
    page.drawText(money(price), { x: rightOf(money(price), COL_PRICE, 9, reg), y, size: 9, font: reg, color: GRAY });
    page.drawText(money(price * qty), { x: rightOf(money(price * qty), COL_SUB, 9, bold), y, size: 9, font: bold, color: BLACK });
    y -= 18;
  });

  // Totals: subtotal, discount (if any), delivery, tax, total
  {
    const lines = [['Subtotal', order.subtotal]];
    if (Number(order.discount) > 0) lines.push([order.discount_label || 'Reorder discount', -Number(order.discount)]);
    lines.push(['Delivery', order.delivery], ['Tax', order.tax]);
    ensure(40 + lines.length * 16);
    y -= 8;
    const labelX = 396;
    page.drawLine({ start: { x: labelX, y: y + 8 }, end: { x: COL_SUB, y: y + 8 }, thickness: 1, color: BORDER });
    for (const [label, val] of lines) {
      const txt = val < 0 ? '-' + money(-val) : money(val);
      page.drawText(label, { x: labelX, y, size: 9, font: reg, color: GRAY });
      page.drawText(txt, { x: rightOf(txt, COL_SUB, 9, reg), y, size: 9, font: reg, color: BLACK });
      y -= 16;
    }
    y -= 10;
    page.drawRectangle({ x: labelX - 14, y: y - 8, width: COL_SUB - labelX + 26, height: 30, color: NAVY });
    page.drawText('TOTAL', { x: labelX, y, size: 11, font: bold, color: WHITE });
    const totalTxt = money(order.total);
    page.drawText(totalTxt, { x: rightOf(totalTxt, COL_SUB, 12, bold), y: y - 1, size: 12, font: bold, color: ORANGE });
    y -= 40;
  }

  // What happens next
  {
    const parts = [st.paid || order.payment_status === 'processing'
      ? 'Your order is confirmed. It is transmitted to the supplier within 1-2 business days after payment is confirmed; transit time is additional. Tracking details are emailed when it ships.'
      : 'We have received your order. It is confirmed when your payment is accepted.'];
    if (order.deliveryRange) parts.push(`Estimated delivery: ${order.deliveryRange} (an estimate, not a guaranteed date).`);
    const note = pdfSafe(parts.join(' '));
    const wrapW = RIGHT - MARGIN - 32;
    const lines = [];
    let line = '';
    for (const w of note.split(' ')) {
      const test = line ? line + ' ' + w : w;
      if (reg.widthOfTextAtSize(test, 8.5) > wrapW) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    const boxH = 24 + lines.length * 12 + 10;
    ensure(boxH + 8);
    page.drawRectangle({ x: MARGIN, y: y - boxH + 14, width: RIGHT - MARGIN, height: boxH, color: LIGHT });
    page.drawText('WHAT HAPPENS NEXT', { x: MARGIN + 16, y, size: 7.5, font: bold, color: GRAY_MID });
    let ny = y - 15;
    for (const l of lines) { page.drawText(l, { x: MARGIN + 16, y: ny, size: 8.5, font: reg, color: GRAY }); ny -= 12; }
    y = y - boxH - 2;
  }

  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const t = `Page ${i + 1} of ${pages.length}`;
      p.drawText(t, { x: rightOf(t, RIGHT, 7.5, reg), y: 14, size: 7.5, font: reg, color: rgb(0.50, 0.62, 0.75) });
    });
  }
  return doc.save();
}

function receiptEmailHtml(order) {
  const row = (label, value, strong) =>
    `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px 0;color:#64748b;font-weight:600;">${label}</td>` +
    `<td style="padding:6px 0;text-align:right;${strong ? 'font-weight:800;font-size:15px;color:#ED7226;' : 'color:#0B1F38;'}">${value}</td></tr>`;
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
    <div style="background:#0B1F38;padding:28px 32px 22px;border-radius:12px 12px 0 0;">
      <p style="color:#ED7226;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin:0 0 6px;">Room Ready Supply</p>
      <h1 style="color:#fff;font-size:22px;margin:0 0 4px;">Order Confirmed</h1>
      <p style="color:rgba(255,255,255,.55);font-size:13px;margin:0;">Order #${esc(order.order_number)}</p>
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px;">
      <p style="font-size:14.5px;color:#334155;line-height:1.6;margin:0 0 20px;">
        Hi ${esc(String(order.customer_name || order.business_name || 'there').slice(0, 80))},<br><br>
        Thank you for your order! Your receipt is attached to this email as a PDF.
        Please keep it for your records.
      </p>
      <div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${row('Order Number', `<strong>${esc(order.order_number)}</strong>`)}
          ${row('Payment Method', esc(methodLabel(order.payment_method)))}
          ${row('Delivery', money(order.delivery))}
          ${row('Order Total', money(order.total), true)}
        </table>
      </div>
      ${order.deliveryRange ? `
      <div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px 20px;margin-bottom:20px;">
        <p style="font-size:14px;color:#334155;margin:0;"><strong>Estimated delivery:</strong> ${esc(order.deliveryRange)}</p>
        <p style="font-size:12px;color:#64748b;margin:6px 0 0;line-height:1.5;">Your order is transmitted to the supplier within 1&ndash;2 business days after payment is confirmed; transit time is additional. Delivery dates are estimates and may be affected by carrier delays, area conditions, weather, holidays, or other circumstances beyond Room Ready Supply's control.</p>
      </div>` : ''}
      <p style="font-size:13px;color:#94a3b8;margin:0;">
        Questions? Email us at <a href="mailto:sales@roomreadysupply.com" style="color:#0B1F38;font-weight:600;">sales@roomreadysupply.com</a>
        or call <strong>(252) 616-0088</strong>.
      </p>
    </div>
  </div>`;
}

async function sendReceipt(order) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
  const pdf = await generateReceiptPdf(order);
  return new Resend(process.env.RESEND_API_KEY).emails.send({
    from: 'Room Ready Supply <orders@roomreadysupply.com>',
    // orders@ is not a monitored inbox -- replies go to sales@.
    reply_to: 'sales@roomreadysupply.com',
    to: order.customer_email,
    subject: `Order Confirmed — #${order.order_number}`,
    html: receiptEmailHtml(order),
    attachments: [{ filename: `RRS-Receipt-${order.order_number}.pdf`, content: Buffer.from(pdf).toString('base64') }],
  });
}

module.exports = { sendReceipt, generateReceiptPdf, receiptEmailHtml };
