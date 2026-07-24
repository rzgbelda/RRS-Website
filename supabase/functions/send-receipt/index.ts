import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Brand colors
const NAVY   = rgb(0.043, 0.122, 0.220);  // #0B1F38
const ORANGE = rgb(0.929, 0.447, 0.149);  // #ED7226
const GRAY   = rgb(0.392, 0.447, 0.510);  // #647180
const LIGHT  = rgb(0.969, 0.976, 0.988);  // #F7F9FC
const WHITE  = rgb(1, 1, 1);
const BLACK  = rgb(0.118, 0.176, 0.220);  // #1E2D38
const BORDER = rgb(0.886, 0.910, 0.941);  // #E2E8F0

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

async function generatePDF(order: any): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const W    = 612;
  const H    = 792;

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);

  // ── Header bar ────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: NAVY });

  page.drawText("ROOM READY SUPPLY", {
    x: 40, y: H - 38, size: 16, font: bold, color: ORANGE,
  });
  page.drawText("Your Order Receipt", {
    x: 40, y: H - 56, size: 10, font: reg, color: WHITE,
  });
  page.drawText("sales@roomreadysupply.com  ·  (252) 227-0073", {
    x: 40, y: H - 72, size: 8.5, font: reg, color: rgb(0.6, 0.72, 0.84),
  });

  const dateStr = new Date(order.created_at || Date.now()).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  page.drawText(`Order #${order.order_number}`, {
    x: W - 210, y: H - 38, size: 12, font: bold, color: WHITE,
  });
  page.drawText(dateStr, {
    x: W - 210, y: H - 56, size: 9, font: reg, color: rgb(0.65, 0.76, 0.87),
  });

  // Orange accent bar
  page.drawRectangle({ x: 0, y: H - 93, width: W, height: 3, color: ORANGE });

  // ── Customer / shipping info ───────────────────────────────────
  let y = H - 120;
  const LX = 40;
  const RX = 320;

  page.drawText("BILL TO", { x: LX, y, size: 8, font: bold, color: GRAY });
  page.drawText("SHIP TO", { x: RX, y, size: 8, font: bold, color: GRAY });
  y -= 15;

  const addr = order.shipping_address || {};
  const lines = {
    left: [
      order.customer_name || "",
      order.business_name || "",
      order.customer_email || "",
      order.phone || "",
    ].filter(Boolean),
    right: [
      order.customer_name || order.business_name || "",
      addr.street || "",
      [addr.city, addr.state, addr.zip].filter(Boolean).join(", "),
    ].filter(Boolean),
  };

  const maxLines = Math.max(lines.left.length, lines.right.length);
  for (let i = 0; i < maxLines; i++) {
    if (lines.left[i])  page.drawText(truncate(lines.left[i], 38),  { x: LX, y, size: 9.5, font: reg, color: BLACK });
    if (lines.right[i]) page.drawText(truncate(lines.right[i], 38), { x: RX, y, size: 9.5, font: reg, color: BLACK });
    y -= 14;
  }

  // Payment method
  y -= 4;
  page.drawText("PAYMENT METHOD", { x: LX, y, size: 8, font: bold, color: GRAY });
  y -= 14;
  const methodLabel =
    order.payment_method === "card"    ? "Credit / Debit Card" :
    order.payment_method === "invoice" ? "Invoice" : "Purchase Order";
  page.drawText(methodLabel, { x: LX, y, size: 9.5, font: reg, color: BLACK });

  // ── Divider ────────────────────────────────────────────────────
  y -= 20;
  page.drawLine({ start: { x: 40, y }, end: { x: W - 40, y }, thickness: 1, color: BORDER });
  y -= 16;

  // ── Items table header ─────────────────────────────────────────
  page.drawRectangle({ x: 40, y: y - 5, width: W - 80, height: 20, color: NAVY });
  page.drawText("PRODUCT",    { x: 50,  y: y + 1, size: 8, font: bold, color: WHITE });
  page.drawText("QTY",        { x: 368, y: y + 1, size: 8, font: bold, color: WHITE });
  page.drawText("UNIT PRICE", { x: 408, y: y + 1, size: 8, font: bold, color: WHITE });
  page.drawText("SUBTOTAL",   { x: 498, y: y + 1, size: 8, font: bold, color: WHITE });
  y -= 20;

  // ── Items rows ─────────────────────────────────────────────────
  const items: any[] = Array.isArray(order.items)
    ? order.items
    : (Array.isArray(order.order_items) ? order.order_items : []);

  items.forEach((item, i) => {
    if (i % 2 === 0) {
      page.drawRectangle({ x: 40, y: y - 5, width: W - 80, height: 19, color: LIGHT });
    }
    const name     = truncate(item.name || item.product_name || "Product", 46);
    const qty      = Number(item.quantity || item.qty || 1);
    const price    = Number(item.price || item.unit_price || 0);
    const subtotal = Number(item.subtotal || (price * qty));
    page.drawText(name,                  { x: 50,  y, size: 9, font: reg,  color: BLACK });
    page.drawText(String(qty),           { x: 378, y, size: 9, font: reg,  color: BLACK });
    page.drawText(`$${price.toFixed(2)}`,     { x: 408, y, size: 9, font: reg,  color: BLACK });
    page.drawText(`$${subtotal.toFixed(2)}`,  { x: 498, y, size: 9, font: bold, color: BLACK });
    y -= 19;
  });

  // ── Totals ─────────────────────────────────────────────────────
  y -= 10;
  page.drawLine({ start: { x: 380, y }, end: { x: W - 40, y }, thickness: 1, color: BORDER });
  y -= 15;

  const subtotal = Number(order.subtotal || 0);
  const total    = Number(order.total    || 0);
  const tax      = Math.max(0, total - subtotal);

  page.drawText("Subtotal", { x: 400, y, size: 9.5, font: reg,  color: GRAY  });
  page.drawText(`$${subtotal.toFixed(2)}`, { x: 498, y, size: 9.5, font: bold, color: BLACK });
  y -= 18;
  page.drawText("Tax (7%)", { x: 400, y, size: 9.5, font: reg,  color: GRAY  });
  page.drawText(`$${tax.toFixed(2)}`, { x: 498, y, size: 9.5, font: bold, color: BLACK });
  y -= 20;
  page.drawRectangle({ x: 380, y: y - 6, width: W - 420, height: 26, color: NAVY });
  page.drawText("TOTAL",           { x: 400, y: y + 4, size: 10.5, font: bold, color: WHITE  });
  page.drawText(`$${total.toFixed(2)}`, { x: 490, y: y + 4, size: 10.5, font: bold, color: ORANGE });
  y -= 36;

  // ── Shipping / tracking info ────────────────────────────────────
  if (order.tracking_number || order.bol_number || order.pro_number) {
    page.drawLine({ start: { x: 40, y }, end: { x: W - 40, y }, thickness: 1, color: BORDER });
    y -= 16;
    page.drawText("SHIPPING INFO", { x: 40, y, size: 8, font: bold, color: GRAY });
    y -= 14;
    if (order.tracking_number) {
      page.drawText(
        `Tracking: ${order.tracking_number}  (${order.shipping_carrier || "Carrier"})`,
        { x: 40, y, size: 9.5, font: reg, color: BLACK },
      );
      y -= 13;
    }
    if (order.bol_number) {
      page.drawText(`BOL #: ${order.bol_number}`, { x: 40, y, size: 9.5, font: reg, color: BLACK });
      y -= 13;
    }
    if (order.pro_number) {
      page.drawText(`PRO #: ${order.pro_number}`, { x: 40, y, size: 9.5, font: reg, color: BLACK });
    }
  }

  // ── Footer ─────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: 48, color: NAVY });
  page.drawText(
    "Room Ready Supply  ·  609 Washington St, Plymouth, NC 27962  ·  (252) 227-0073  ·  sales@roomreadysupply.com",
    { x: 40, y: 26, size: 7.5, font: reg, color: rgb(0.6, 0.72, 0.84) },
  );
  page.drawText("Thank you for your business! We appreciate your trust in Room Ready Supply.", {
    x: 40, y: 12, size: 7.5, font: reg, color: rgb(0.5, 0.62, 0.75),
  });

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
