// GoHighLevel chat widget -- its own file on purpose.
//
// This used to live in script.js, which every page loads, including login,
// checkout and account. Those pages collect phone numbers, and GHL's A2P
// compliance scan flags any page where the widget code is present alongside
// a phone field ("multiple opt-ins"), even though the widget was switched off
// there at runtime. So the code is now included ONLY on pages without phone
// or consent forms: do not add <script src="/ghl-chat.js"> to checkout,
// payment, order-confirmation, account, login, reset-password or quote.
//
// GoHighLevel web chat, routed to the RRS GHL inbox. Loaded from here so
// every page that includes script.js gets it from one place, and three
// deliberate limits apply:
//
//  1. Main domain only. Other subdomains share this site code, but a chat
//     there would land in RRS's inbox as if RRS were the seller -- those
//     sites must present RRS as supplier only. Vercel preview
//     URLs and localhost are skipped too.
//  2. Not on pages that handle payment, login or account data. Any
//     third-party script runs with full access to the page it is on, so
//     it stays off the pages where that access matters most. vercel.json
//     backs this up: the CSP on those pages does not allow
//     leadconnectorhq.com scripts at all, so even a stray include there
//     would be blocked by the browser.
//  3. Loaded after the page has finished loading and gone idle, so the
//     widget never competes with the page's own content for bandwidth.
const GHL_CHAT_WIDGET_ID = "6ab6950950fc24ace644cf46";
const GHL_CHAT_HOSTS = ["roomreadysupply.com", "www.roomreadysupply.com"];
const GHL_CHAT_EXCLUDED_PATHS = [
  "/checkout", "/payment", "/order-confirmation", "/quote",
  "/account", "/login", "/reset-password", "/admin",
];

function ghlChatAllowedHere() {
  if (!GHL_CHAT_HOSTS.includes(location.hostname)) return false;
  const p = (location.pathname || "/").toLowerCase().replace(/\.html$/, "").replace(/\/+$/, "");
  return !GHL_CHAT_EXCLUDED_PATHS.includes(p);
}

function loadGhlChatWidget() {
  if (!ghlChatAllowedHere()) return;
  if (document.querySelector('script[data-widget-id="' + GHL_CHAT_WIDGET_ID + '"]')) return;
  const s = document.createElement("script");
  s.src = "https://widgets.leadconnectorhq.com/loader.js";
  s.setAttribute("data-resources-url", "https://widgets.leadconnectorhq.com/chat-widget/loader.js");
  s.setAttribute("data-widget-id", GHL_CHAT_WIDGET_ID);
  s.setAttribute("data-source", "WEB_USER");
  s.async = true;
  s.referrerPolicy = "strict-origin-when-cross-origin";
  document.body.appendChild(s);
}

(function scheduleGhlChatWidget() {
  const start = () => ("requestIdleCallback" in window)
    ? requestIdleCallback(loadGhlChatWidget, { timeout: 4000 })
    : setTimeout(loadGhlChatWidget, 1500);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();


// The widget loads lazily (after page load + idle), so a fast click can
// arrive before it exists: load it now if needed, then wait briefly for
// GHL's API. If it never appears (blocked by an ad blocker, say), the
// header's phone number and email are still there.
function openGhlChat() {
  loadGhlChatWidget();
  let tries = 0;
  (function attempt() {
    const cw = window.leadConnector && window.leadConnector.chatWidget;
    if (cw && typeof cw.openWidget === "function") {
      try { cw.openWidget(); } catch (e) { console.warn("GHL openWidget failed", e); }
      return;
    }
    if (++tries < 40) setTimeout(attempt, 250);
  })();
  if (typeof gtag === "function") gtag("event", "price_inquiry_chat");
}

