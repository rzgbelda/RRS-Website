import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Brand colors
const NAVY     = rgb(0.043, 0.122, 0.220);  // #0B1F38
const NAVY_SOFT= rgb(0.145, 0.235, 0.353);  // #253C5A - lighter navy for rules
const ORANGE   = rgb(0.929, 0.447, 0.149);  // #ED7226
const GRAY     = rgb(0.392, 0.447, 0.510);  // #647180
const GRAY_MID = rgb(0.553, 0.600, 0.655);  // #8D99A7
const LIGHT    = rgb(0.973, 0.980, 0.988);  // #F8FAFC
const PANEL    = rgb(0.949, 0.965, 0.980);  // #F2F6FA
const WHITE    = rgb(1, 1, 1);
const BLACK    = rgb(0.118, 0.176, 0.220);  // #1E2D38
const BORDER   = rgb(0.886, 0.910, 0.941);  // #E2E8F0
const GREEN    = rgb(0.086, 0.451, 0.235);  // #16733C
const GREEN_BG = rgb(0.925, 0.976, 0.945);  // #ECF9F1
const AMBER    = rgb(0.573, 0.329, 0.024);  // #925406
const AMBER_BG = rgb(0.996, 0.965, 0.898);  // #FEF6E5

// Page geometry
const W      = 612;   // US Letter
const H      = 792;
const MARGIN = 44;
const RIGHT  = W - MARGIN;   // 568
const FOOTER_H = 54;
const BODY_FLOOR = FOOTER_H + 34;  // never draw body content below this

/** Truncate to fit a pixel width rather than a guessed character count. */
function fitText(str: string, maxWidth: number, font: any, size: number) {
  if (font.widthOfTextAtSize(str, size) <= maxWidth) return str;
  let s = str;
  while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

const money = (n: number) => "$" + Number(n || 0).toFixed(2);

async function generatePDF(order: any): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);

  // Fetch the logo once, reused across pages.
  let logoImage: any = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const logoRes = await fetch("https://www.roomreadysupply.com/RRS_LOGO_White_small.png", { signal: controller.signal });
    clearTimeout(timer);
    if (logoRes.ok) {
      const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
      if (logoBytes.length < 300000) logoImage = await doc.embedPng(logoBytes);
    }
  } catch (_) { /* fall back to wordmark */ }

  const dateStr = new Date(order.created_at || Date.now()).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const orderNo = String(order.order_number || "—");

  const isPaid = order.payment_method === "card";
  const methodLabel =
    order.payment_method === "card"    ? "Credit / Debit Card" :
    order.payment_method === "invoice" ? "Invoice" :
    order.payment_method === "po"      ? "Purchase Order" : "—";

  const pages: any[] = [];

  /** Draw the navy masthead + orange rule. Returns the y to continue from. */
  function drawHeader(page: any, continued: boolean) {
    page.drawRectangle({ x: 0, y: H - 104, width: W, height: 104, color: NAVY });
    page.drawRectangle({ x: 0, y: H - 108, width: W, height: 4, color: ORANGE });

    if (logoImage) {
      const d = logoImage.scale(64 / logoImage.width);
      page.drawImage(logoImage, { x: MARGIN, y: H - 86, width: d.width, height: d.height });
      page.drawText("ROOM READY SUPPLY", {
        x: MARGIN + 78, y: H - 44, size: 12.5, font: bold, color: WHITE,
      });
      page.drawText(continued ? "Receipt (continued)" : "Order Receipt", {
        x: MARGIN + 78, y: H - 60, size: 9.5, font: reg, color: rgb(0.62, 0.73, 0.85),
      });
      page.drawText("609 Washington St, Plymouth, NC 27962", {
        x: MARGIN + 78, y: H - 74, size: 8, font: reg, color: rgb(0.50, 0.62, 0.75),
      });
    } else {
      page.drawText("ROOM READY SUPPLY", { x: MARGIN, y: H - 44, size: 15, font: bold, color: ORANGE });
      page.drawText(continued ? "Receipt (continued)" : "Order Receipt", {
        x: MARGIN, y: H - 62, size: 9.5, font: reg, color: WHITE,
      });
      page.drawText("609 Washington St, Plymouth, NC 27962", {
        x: MARGIN, y: H - 76, size: 8, font: reg, color: rgb(0.50, 0.62, 0.75),
      });
    }

    // Right-aligned order identity
    const noText = `Order #${orderNo}`;
    page.drawText(noText, {
      x: RIGHT - bold.widthOfTextAtSize(noText, 13), y: H - 46, size: 13, font: bold, color: WHITE,
    });
    page.drawText(dateStr, {
      x: RIGHT - reg.widthOfTextAtSize(dateStr, 9), y: H - 62, size: 9, font: reg, color: rgb(0.62, 0.73, 0.85),
    });

    return H - 108 - 26;
  }

  function drawFooter(page: any) {
    page.drawRectangle({ x: 0, y: 0, width: W, height: FOOTER_H, color: NAVY });
    page.drawRectangle({ x: 0, y: FOOTER_H, width: W, height: 3, color: ORANGE });
    page.drawText("Room Ready Supply  ·  609 Washington St, Plymouth, NC 27962", {
      x: MARGIN, y: 32, size: 7.5, font: reg, color: rgb(0.62, 0.73, 0.85),
    });
    page.drawText("(252) 227-0073  ·  sales@roomreadysupply.com  ·  roomreadysupply.com", {
      x: MARGIN, y: 20, size: 7.5, font: reg, color: rgb(0.62, 0.73, 0.85),
    });
    const thanks = "Thank you for your business.";
    page.drawText(thanks, {
      x: RIGHT - reg.widthOfTextAtSize(thanks, 7.5), y: 26, size: 7.5, font: reg, color: rgb(0.50, 0.62, 0.75),
    });
  }

  function newPage(continued: boolean) {
    const p = doc.addPage([W, H]);
    pages.push(p);
    const startY = drawHeader(p, continued);
    drawFooter(p);
    return { page: p, y: startY };
  }

  let { page, y } = newPage(false);

  /** Ensure `needed` vertical space remains; otherwise start a fresh page. */
  function ensure(needed: number) {
    if (y - needed < BODY_FLOOR) {
      const next = newPage(true);
      page = next.page;
      y = next.y;
      return true;
    }
    return false;
  }

  const rightOf = (text: string, edge: number, size: number, font: any) =>
    edge - font.widthOfTextAtSize(text, size);

  // ── Status pill ────────────────────────────────────────────────
  {
    const label = isPaid ? "PAYMENT RECEIVED" : "AWAITING PAYMENT";
    const fg    = isPaid ? GREEN : AMBER;
    const bg    = isPaid ? GREEN_BG : AMBER_BG;
    const tw    = bold.widthOfTextAtSize(label, 8.5);
    page.drawRectangle({ x: MARGIN, y: y - 6, width: tw + 22, height: 21, color: bg });
    page.drawRectangle({ x: MARGIN, y: y - 6, width: 3, height: 21, color: fg });
    page.drawText(label, { x: MARGIN + 12, y, size: 8.5, font: bold, color: fg });

    const methodTxt = `Paid by ${methodLabel}`;
    const shown = isPaid ? methodTxt : `Payment method: ${methodLabel}`;
    page.drawText(shown, {
      x: rightOf(shown, RIGHT, 9, reg), y, size: 9, font: reg, color: GRAY,
    });
    y -= 30;
  }

  // ── Bill to / Ship to panel ────────────────────────────────────
  {
    const addr = order.shipping_address || {};
    const left = [
      order.business_name || "",
      order.customer_name || "",
      order.customer_email || "",
      order.phone || "",
    ].filter(Boolean);
    const right = [
      order.customer_name || order.business_name || "",
      addr.street || "",
      [addr.city, addr.state, addr.zip].filter(Boolean).join(", "),
    ].filter(Boolean);

    const rows    = Math.max(left.length, right.length, 1);
    const panelH  = 24 + rows * 12.5 + 8;
    ensure(panelH + 10);

    page.drawRectangle({ x: MARGIN, y: y - panelH + 16, width: RIGHT - MARGIN, height: panelH, color: PANEL });
    const colL = MARGIN + 16;
    const colR = MARGIN + (RIGHT - MARGIN) / 2 + 8;

    page.drawText("BILL TO", { x: colL, y, size: 7.5, font: bold, color: GRAY_MID });
    page.drawText("SHIP TO", { x: colR, y, size: 7.5, font: bold, color: GRAY_MID });
    let ry = y - 15;
    const colW = (RIGHT - MARGIN) / 2 - 30;
    for (let i = 0; i < rows; i++) {
      if (left[i]) {
        page.drawText(fitText(left[i], colW, i === 0 ? bold : reg, 9), {
          x: colL, y: ry, size: 9, font: i === 0 ? bold : reg, color: i === 0 ? BLACK : GRAY,
        });
      }
      if (right[i]) {
        page.drawText(fitText(right[i], colW, i === 0 ? bold : reg, 9), {
          x: colR, y: ry, size: 9, font: i === 0 ? bold : reg, color: i === 0 ? BLACK : GRAY,
        });
      }
      ry -= 12.5;
    }
    y = y - panelH + 4;
  }

  // ── Items table ────────────────────────────────────────────────
  const items: any[] = Array.isArray(order.items) && order.items.length
    ? order.items
    : (Array.isArray(order.order_items) ? order.order_items : []);

  const COL_QTY   = 392;   // right edge
  const COL_PRICE = 476;   // right edge
  const COL_SUB   = RIGHT - 12;
  const NAME_W    = COL_QTY - (MARGIN + 12) - 46;

  function drawTableHead() {
    page.drawRectangle({ x: MARGIN, y: y - 6, width: RIGHT - MARGIN, height: 22, color: NAVY });
    page.drawText("PRODUCT", { x: MARGIN + 12, y, size: 7.5, font: bold, color: WHITE });
    page.drawText("QTY",     { x: rightOf("QTY", COL_QTY, 7.5, bold), y, size: 7.5, font: bold, color: WHITE });
    page.drawText("UNIT PRICE", { x: rightOf("UNIT PRICE", COL_PRICE, 7.5, bold), y, size: 7.5, font: bold, color: WHITE });
    page.drawText("AMOUNT", { x: rightOf("AMOUNT", COL_SUB, 7.5, bold), y, size: 7.5, font: bold, color: WHITE });
    y -= 22;
  }

  ensure(70);
  drawTableHead();

  if (!items.length) {
    page.drawRectangle({ x: MARGIN, y: y - 6, width: RIGHT - MARGIN, height: 22, color: LIGHT });
    page.drawText("Item detail is available in your account at roomreadysupply.com", {
      x: MARGIN + 12, y, size: 8.5, font: reg, color: GRAY_MID,
    });
    y -= 26;
  }

  items.forEach((item, i) => {
    if (ensure(26)) drawTableHead();

    if (i % 2 === 0) {
      page.drawRectangle({ x: MARGIN, y: y - 5, width: RIGHT - MARGIN, height: 18, color: LIGHT });
    }
    const rawName  = item.name || item.product_name || "Product";
    const qty      = Number(item.quantity ?? item.qty ?? 1);
    const price    = Number(item.price ?? item.unit_price ?? item.price_per_case ?? 0);
    const lineSub  = Number(item.subtotal ?? price * qty);

    page.drawText(fitText(rawName, NAME_W, reg, 9), { x: MARGIN + 12, y, size: 9, font: reg, color: BLACK });
    page.drawText(String(qty), { x: rightOf(String(qty), COL_QTY, 9, reg), y, size: 9, font: reg, color: GRAY });
    page.drawText(money(price), { x: rightOf(money(price), COL_PRICE, 9, reg), y, size: 9, font: reg, color: GRAY });
    page.drawText(money(lineSub), { x: rightOf(money(lineSub), COL_SUB, 9, bold), y, size: 9, font: bold, color: BLACK });
    y -= 18;
  });

  // ── Totals ─────────────────────────────────────────────────────
  {
    ensure(96);
    y -= 8;
    const subtotal = Number(order.subtotal || 0);
    const total    = Number(order.total    || 0);
    const tax      = Math.max(0, total - subtotal);
    const taxPct   = subtotal > 0 ? Math.round((tax / subtotal) * 100) : 0;
    const labelX   = 396;

    page.drawLine({ start: { x: labelX, y: y + 8 }, end: { x: COL_SUB, y: y + 8 }, thickness: 1, color: BORDER });

    page.drawText("Subtotal", { x: labelX, y, size: 9, font: reg, color: GRAY });
    page.drawText(money(subtotal), { x: rightOf(money(subtotal), COL_SUB, 9, reg), y, size: 9, font: reg, color: BLACK });
    y -= 16;

    page.drawText(taxPct ? `Tax (${taxPct}%)` : "Tax", { x: labelX, y, size: 9, font: reg, color: GRAY });
    page.drawText(money(tax), { x: rightOf(money(tax), COL_SUB, 9, reg), y, size: 9, font: reg, color: BLACK });
    y -= 26;

    page.drawRectangle({ x: labelX - 14, y: y - 8, width: COL_SUB - labelX + 26, height: 30, color: NAVY });
    page.drawText("TOTAL", { x: labelX, y, size: 11, font: bold, color: WHITE });
    const totalTxt = money(total);
    page.drawText(totalTxt, { x: rightOf(totalTxt, COL_SUB, 12, bold), y: y - 1, size: 12, font: bold, color: ORANGE });
    y -= 40;
  }

  // ── Shipping details ───────────────────────────────────────────
  if (order.tracking_number || order.bol_number || order.pro_number) {
    const rows: string[][] = [];
    if (order.tracking_number) rows.push(["Tracking number", `${order.tracking_number}${order.shipping_carrier ? "  (" + order.shipping_carrier + ")" : ""}`]);
    if (order.bol_number)      rows.push(["Bill of lading", String(order.bol_number)]);
    if (order.pro_number)      rows.push(["PRO number", String(order.pro_number)]);

    const boxH = 24 + rows.length * 14 + 8;
    ensure(boxH + 12);
    page.drawRectangle({ x: MARGIN, y: y - boxH + 14, width: RIGHT - MARGIN, height: boxH, color: PANEL });
    page.drawRectangle({ x: MARGIN, y: y - boxH + 14, width: 3, height: boxH, color: ORANGE });
    page.drawText("SHIPPING", { x: MARGIN + 16, y, size: 7.5, font: bold, color: GRAY_MID });
    let sy = y - 15;
    for (const [k, v] of rows) {
      page.drawText(k, { x: MARGIN + 16, y: sy, size: 9, font: reg, color: GRAY });
      page.drawText(fitText(v, 330, bold, 9), { x: MARGIN + 150, y: sy, size: 9, font: bold, color: BLACK });
      sy -= 14;
    }
    y = y - boxH - 2;
  }

  // ── What happens next ──────────────────────────────────────────
  {
    const note = isPaid
      ? "Your payment has been received and your order is being prepared. You will receive tracking details by email as soon as it ships."
      : order.payment_method === "po"
        ? "We have received your purchase order. Our team will confirm availability and pricing, then send an invoice for approval before the order ships."
        : "Your order request has been received. Our team will confirm availability and pricing, then send your invoice. Nothing is charged until you approve it.";

    // Wrap to the panel width
    const wrapW = RIGHT - MARGIN - 32;
    const words = note.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (reg.widthOfTextAtSize(test, 8.5) > wrapW) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);

    const boxH = 24 + lines.length * 12 + 10;
    ensure(boxH + 8);
    page.drawRectangle({ x: MARGIN, y: y - boxH + 14, width: RIGHT - MARGIN, height: boxH, color: LIGHT });
    page.drawText("WHAT HAPPENS NEXT", { x: MARGIN + 16, y, size: 7.5, font: bold, color: GRAY_MID });
    let ny = y - 15;
    for (const l of lines) {
      page.drawText(l, { x: MARGIN + 16, y: ny, size: 8.5, font: reg, color: GRAY });
      ny -= 12;
    }
    y = y - boxH - 2;
  }

  // Page numbers, only when there is more than one page
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const t = `Page ${i + 1} of ${pages.length}`;
      p.drawText(t, { x: rightOf(t, RIGHT, 7.5, reg), y: 14, size: 7.5, font: reg, color: rgb(0.50, 0.62, 0.75) });
    });
  }

  return doc.save();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const order = await req.json();

    if (!order.customer_email) {
      return new Response(JSON.stringify({ error: "Missing customer_email" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Generate PDF
    const pdfBytes = await generatePDF(order);

    // Download mode: return the PDF directly instead of emailing it, so
    // staff can save a copy from the admin panel without sending an email.
    const url = new URL(req.url);
    if (url.searchParams.get("download") === "1") {
      return new Response(pdfBytes, {
        headers: {
          ...CORS,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="RRS-Receipt-${order.order_number || "order"}.pdf"`,
        },
      });
    }

    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));

    // Simple HTML email body
    const totalStr = `$${Number(order.total || 0).toFixed(2)}`;
    const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1e293b;">
      <div style="background:#0B1F38;padding:28px 32px 22px;border-radius:12px 12px 0 0;">
        <p style="color:#ED7226;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin:0 0 6px;">Room Ready Supply</p>
        <h1 style="color:#fff;font-size:22px;margin:0 0 4px;">Order Confirmed</h1>
        <p style="color:rgba(255,255,255,.55);font-size:13px;margin:0;">Order #${order.order_number}</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px;">
        <p style="font-size:14.5px;color:#334155;line-height:1.6;margin:0 0 20px;">
          Hi ${order.customer_name || order.business_name || "there"},<br><br>
          Thank you for your order! Your receipt is attached to this email as a PDF.
          Please keep it for your records.
        </p>

        <div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:6px 0;color:#64748b;font-weight:600;">Order Number</td>
              <td style="padding:6px 0;text-align:right;font-weight:700;color:#0B1F38;">${order.order_number}</td>
            </tr>
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:6px 0;color:#64748b;font-weight:600;">Payment Method</td>
              <td style="padding:6px 0;text-align:right;">${order.payment_method === "card" ? "Credit / Debit Card" : order.payment_method === "invoice" ? "Invoice" : "Purchase Order"}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748b;font-weight:600;">Order Total</td>
              <td style="padding:6px 0;text-align:right;font-weight:800;font-size:15px;color:#ED7226;">${totalStr}</td>
            </tr>
          </table>
        </div>

        <p style="font-size:13px;color:#94a3b8;margin:0;">
          Questions? Email us at <a href="mailto:sales@roomreadysupply.com" style="color:#0B1F38;font-weight:600;">sales@roomreadysupply.com</a>
          or call <strong>(252) 227-0073</strong>.
        </p>
      </div>
    </div>`;

    // Send via Resend with PDF attachment
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    "Room Ready Supply <orders@roomreadysupply.com>",
        // orders@ is not a monitored inbox -- the body already tells the
        // customer to email sales@, so Reply also needs to land there.
        reply_to: "sales@roomreadysupply.com",
        to:      [order.customer_email],
        subject: `Order Confirmed — #${order.order_number}`,
        html,
        attachments: [{
          filename: `RRS-Receipt-${order.order_number}.pdf`,
          content:  pdfBase64,
        }],
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      throw new Error(`Resend error: ${err}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[send-receipt] error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
