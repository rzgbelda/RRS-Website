const { Resend } = require('resend');

// Resend's constructor throws when the API key is missing. Building it at
// module load meant a missing RESEND_API_KEY crashed this file on import --
// which also took down stripe-webhook.js, since it requires this module.
// Build it lazily instead so a missing key only degrades email, and never
// prevents an order from being recorded.
let _resend = null;
function getResend() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  _resend = new Resend(key);
  return _resend;
}

const BRAND = {
  navy: '#0B1F38',
  orange: '#ED7226',
  lightGray: '#f8fafc',
  border: '#e2e8f0',
  textMuted: '#64748b',
};

function formatCurrency(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function buildItemRows(items) {
  if (!items || !items.length) return '<tr><td colspan="3" style="padding:12px;color:#94a3b8;font-size:13px;">See order details in your account.</td></tr>';
  return items.map(function (item) {
    var price = parseFloat(item.price) || 0;
    var qty = parseInt(item.quantity) || 1;
    return '<tr>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;">' + (item.name || 'Item') + '</td>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;text-align:center;">' + qty + '</td>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0B1F38;font-weight:700;text-align:right;">$' + (price * qty).toFixed(2) + '</td>' +
      '</tr>';
  }).join('');
}

function customerEmailHtml(order) {
  var addr = order.shipping_address || {};
  var addrStr = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ') || 'See order details';
  var amountTotal = order.amount_total || 0;
  var tax = order.tax_amount || 0;
  var subtotal = amountTotal - tax;
  var itemRows = buildItemRows(order.items);

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">' +
    '<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">' +

    // Header
    '<div style="background:#0B1F38;padding:32px 40px;text-align:center;">' +
    '<p style="color:#ED7226;font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;margin:0 0 8px;">Room Ready Supply</p>' +
    '<h1 style="color:#fff;font-size:26px;font-weight:900;margin:0 0 8px;letter-spacing:-.5px;">Order Confirmed!</h1>' +
    '<p style="color:rgba(255,255,255,.65);font-size:14px;margin:0;">We\'ve received your order and our team is on it.</p>' +
    '</div>' +

    // Order badge
    '<div style="background:#fffbf7;border-bottom:1.5px solid #fde8d4;padding:16px 40px;display:flex;align-items:center;justify-content:space-between;">' +
    '<span style="font-size:13px;font-weight:700;color:#ED7226;">Order ' + order.order_number + '</span>' +
    '<span style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:100px;padding:4px 14px;font-size:12px;font-weight:800;color:#16a34a;">Payment Received</span>' +
    '</div>' +

    // Body
    '<div style="padding:32px 40px;">' +

    '<p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 28px;">Hi ' + (order.customer_name || 'there') + ', thanks for your order! Here\'s a summary of what you ordered. Our team will be in touch shortly to confirm availability and provide a freight quote.</p>' +

    // Items table
    '<h2 style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin:0 0 12px;">Items Ordered</h2>' +
    '<table style="width:100%;border-collapse:collapse;border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:24px;">' +
    '<thead><tr style="background:#f8fafc;">' +
    '<th style="padding:10px 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;text-align:left;">Product</th>' +
    '<th style="padding:10px 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;text-align:center;">Qty</th>' +
    '<th style="padding:10px 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;text-align:right;">Price</th>' +
    '</tr></thead>' +
    '<tbody>' + itemRows + '</tbody>' +
    '</table>' +

    // Totals
    '<table style="width:100%;border-collapse:collapse;margin-bottom:28px;">' +
    '<tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Subtotal</td><td style="padding:6px 0;font-size:14px;color:#334155;text-align:right;">$' + (subtotal / 100).toFixed(2) + '</td></tr>' +
    '<tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Tax</td><td style="padding:6px 0;font-size:14px;color:#334155;text-align:right;">$' + (tax / 100).toFixed(2) + '</td></tr>' +
    '<tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Shipping</td><td style="padding:6px 0;font-size:13px;color:#94a3b8;text-align:right;">Freight quote to follow</td></tr>' +
    '<tr style="border-top:2px solid #e2e8f0;"><td style="padding:12px 0 0;font-size:16px;font-weight:900;color:#0B1F38;">Total Charged</td><td style="padding:12px 0 0;font-size:16px;font-weight:900;color:#0B1F38;text-align:right;">' + formatCurrency(amountTotal) + '</td></tr>' +
    '</table>' +

    // Delivery info
    '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:28px;">' +
    '<h2 style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin:0 0 14px;">Delivery Information</h2>' +
    '<p style="font-size:14px;color:#334155;margin:0 0 6px;"><strong>Business:</strong> ' + (order.business_name || '—') + '</p>' +
    '<p style="font-size:14px;color:#334155;margin:0 0 6px;"><strong>Contact:</strong> ' + (order.customer_name || '—') + '</p>' +
    '<p style="font-size:14px;color:#334155;margin:0 0 6px;"><strong>Phone:</strong> ' + (order.phone || '—') + '</p>' +
    '<p style="font-size:14px;color:#334155;margin:0;"><strong>Ship to:</strong> ' + addrStr + '</p>' +
    '</div>' +

    // What's next
    '<div style="background:#fffbf7;border:1.5px solid #fde8d4;border-radius:12px;padding:20px;margin-bottom:28px;">' +
    '<h2 style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#ED7226;margin:0 0 14px;">What Happens Next</h2>' +
    '<p style="font-size:14px;color:#334155;margin:0 0 8px;">&#x2705; <strong>Order received</strong> — we\'re reviewing your order now.</p>' +
    '<p style="font-size:14px;color:#334155;margin:0 0 8px;">&#x1F4E6; <strong>Freight quote</strong> — we\'ll email you a shipping cost before finalizing.</p>' +
    '<p style="font-size:14px;color:#334155;margin:0;">&#x1F69A; <strong>Dispatch & tracking</strong> — you\'ll get tracking info when your order ships.</p>' +
    '</div>' +

    // Help line
    '<p style="font-size:13px;color:#94a3b8;text-align:center;line-height:1.6;margin:0;">Questions? Reply to this email or call us at <strong style="color:#334155;">(916) 572-2888</strong></p>' +

    '</div>' +

    // Footer
    '<div style="background:#f8fafc;border-top:1.5px solid #e2e8f0;padding:20px 40px;text-align:center;">' +
    '<p style="font-size:12px;color:#94a3b8;margin:0;">Room Ready Supply &bull; Sacramento, CA &bull; <a href="https://www.roomreadysupply.com" style="color:#ED7226;text-decoration:none;">roomreadysupply.com</a></p>' +
    '</div>' +

    '</div></body></html>';
}

function internalAlertHtml(order) {
  var addr = order.shipping_address || {};
  var addrStr = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ') || '—';
  var items = order.items || [];
  var itemList = items.map(function (i) { return '• ' + (i.quantity || 1) + 'x ' + (i.name || 'Item'); }).join('\n');

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;padding:32px;background:#f1f5f9;">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1.5px solid #e2e8f0;">' +
    '<div style="background:#0B1F38;color:#fff;border-radius:8px;padding:14px 20px;margin-bottom:20px;">' +
    '<p style="margin:0;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#ED7226;">New Order Alert</p>' +
    '<h2 style="margin:4px 0 0;font-size:20px;font-weight:900;">' + order.order_number + '</h2>' +
    '</div>' +

    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">' +
    '<tr><td style="padding:7px 0;color:#64748b;width:140px;">Amount</td><td style="font-weight:800;color:#0B1F38;font-size:16px;">' + formatCurrency(order.amount_total || 0) + '</td></tr>' +
    '<tr><td style="padding:7px 0;color:#64748b;">Customer</td><td>' + (order.customer_name || '—') + '</td></tr>' +
    '<tr><td style="padding:7px 0;color:#64748b;">Business</td><td>' + (order.business_name || '—') + '</td></tr>' +
    '<tr><td style="padding:7px 0;color:#64748b;">Email</td><td><a href="mailto:' + (order.customer_email || '') + '" style="color:#ED7226;">' + (order.customer_email || '—') + '</a></td></tr>' +
    '<tr><td style="padding:7px 0;color:#64748b;">Phone</td><td>' + (order.phone || '—') + '</td></tr>' +
    '<tr><td style="padding:7px 0;color:#64748b;">Ship to</td><td>' + addrStr + '</td></tr>' +
    '</table>' +

    '<div style="background:#f8fafc;border-radius:8px;padding:14px;margin-bottom:20px;">' +
    '<p style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 8px;">Items</p>' +
    '<pre style="margin:0;font-family:inherit;font-size:14px;color:#334155;white-space:pre-wrap;">' + (itemList || 'No item detail') + '</pre>' +
    '</div>' +

    '<a href="https://www.roomreadysupply.com/admin" style="display:block;background:#ED7226;color:#fff;text-decoration:none;text-align:center;padding:12px 24px;border-radius:8px;font-weight:800;font-size:14px;">View in Admin Panel →</a>' +
    '</div></body></html>';
}

async function sendCustomerConfirmation(order) {
  return getResend().emails.send({
    from: 'Room Ready Supply <orders@roomreadysupply.com>',
    to: order.customer_email,
    subject: 'Order Confirmed — ' + order.order_number,
    html: customerEmailHtml(order),
  });
}

async function sendInternalAlert(order) {
  return getResend().emails.send({
    from: 'Room Ready Supply Orders <orders@roomreadysupply.com>',
    to: process.env.INTERNAL_ALERT_EMAIL || 'eric@roomreadysupply.com',
    subject: '[New Order] ' + order.order_number + ' — ' + formatCurrency(order.amount_total || 0),
    html: internalAlertHtml(order),
  });
}

module.exports = { sendCustomerConfirmation, sendInternalAlert };
