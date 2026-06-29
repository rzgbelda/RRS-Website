// Warp Freight API Integration
// Origin: 609 Washington St, Plymouth, NC 27962
// Docs: https://www.wearewarp.com/api/v1

const WARP_CONFIG = {
  apiKey: 'wak_live_kQvPhM0LL-GeeTeYcqA9UICNNJV3YwsCUh1t0x3Gv20',  // production key
  baseUrl: 'https://www.wearewarp.com/api/v1',
  origin: {
    street: '609 Washington St',
    city: 'Plymouth',
    state: 'NC',
    zip: '27962',
  },
  pallet: {
    length_in: 48,
    width_in: 40,
    max_weight_lbs: 1500,
  },
};

// Default dimensions used when a product has no weight/dimensions set.
// Update these per-product once you have the real data.
const DEFAULT_ITEM_DIMS = {
  weight_lbs: 20,
  length_in: 14,
  width_in: 12,
  height_in: 10,
  freight_class: '70', // NMFC class 70 = common household/commercial supplies
};

// Real product dimensions from products.csv
const PRODUCT_DIMS = {
  '11008635042': { weight_lbs: 57.5, length_in: 13,   width_in: 13,   height_in: 13,   freight_class: '70' },
  '74828':       { weight_lbs: 18.6, length_in: 11.5, width_in: 8.5,  height_in: 11,   freight_class: '70' },
  '68970':       { weight_lbs: 14.5, length_in: 11.5, width_in: 8.5,  height_in: 12.5, freight_class: '70' },
  '31547':       { weight_lbs: 12.1, length_in: 10,   width_in: 10,   height_in: 11,   freight_class: '70' },
  'P22884':      { weight_lbs: 22,   length_in: 17,   width_in: 11.5, height_in: 8.5,  freight_class: '70' },
  '438-5155':    { weight_lbs: 18,   length_in: 10.5, width_in: 8.5,  height_in: 12.5, freight_class: '70' },
  'P050':        { weight_lbs: 19,   length_in: 11,   width_in: 8.5,  height_in: 12.5, freight_class: '70' },
  '316147':      { weight_lbs: 29,   length_in: 13,   width_in: 10,   height_in: 12,   freight_class: '70' },
  '313042':      { weight_lbs: 16,   length_in: 12,   width_in: 9,    height_in: 12.5, freight_class: '70' },
  'PP40PAIL':    { weight_lbs: 43,   length_in: 15,   width_in: 15,   height_in: 14,   freight_class: '70' },
  '5016':        { weight_lbs: 41,   length_in: 13,   width_in: 13,   height_in: 13.5, freight_class: '70' },
  '60607':       { weight_lbs: 18.5, length_in: 12,   width_in: 10,   height_in: 11.5, freight_class: '70' },
  '97330':       { weight_lbs: 17,   length_in: 12,   width_in: 10,   height_in: 8.5,  freight_class: '70' },
  '70681':       { weight_lbs: 46,   length_in: 13,   width_in: 13,   height_in: 15,   freight_class: '70' },
  'PL385815B':   { weight_lbs: 16.2, length_in: 17.1, width_in: 13,   height_in: 4.8,  freight_class: '70' },
  'S243308N':    { weight_lbs: 17.2, length_in: 17,   width_in: 13,   height_in: 5,    freight_class: '70' },
  'RM3858H':     { weight_lbs: 21,   length_in: 17.5, width_in: 13.5, height_in: 5.5,  freight_class: '70' },
  'NOVA519':     { weight_lbs: 25.5, length_in: 17.5, width_in: 13.5, height_in: 5.5,  freight_class: '70' },
  'NOVA523':     { weight_lbs: 34,   length_in: 18.5, width_in: 14.5, height_in: 6.5,  freight_class: '70' },
  'NOVA517':     { weight_lbs: 21,   length_in: 17,   width_in: 13,   height_in: 5,    freight_class: '70' },
  'NOVA522':     { weight_lbs: 31,   length_in: 18,   width_in: 14,   height_in: 6,    freight_class: '70' },
  '276':         { weight_lbs: 26,   length_in: 26.5, width_in: 18,   height_in: 17,   freight_class: '85' },
  '248':         { weight_lbs: 23,   length_in: 26.1, width_in: 17.6, height_in: 16.8, freight_class: '85' },
  'FT 30852':    { weight_lbs: 19,   length_in: 24,   width_in: 15.5, height_in: 14,   freight_class: '85' },
  'FT 301002':   { weight_lbs: 20,   length_in: 24,   width_in: 15.5, height_in: 14.5, freight_class: '85' },
  '11516':       { weight_lbs: 21,   length_in: 24.5, width_in: 16,   height_in: 15,   freight_class: '85' },
  '11513':       { weight_lbs: 18.5, length_in: 22.5, width_in: 15,   height_in: 12.5, freight_class: '85' },
  'CP 660010':   { weight_lbs: 22,   length_in: 22,   width_in: 15,   height_in: 9.5,  freight_class: '85' },
  '410081':      { weight_lbs: 23,   length_in: 22,   width_in: 15,   height_in: 10,   freight_class: '85' },
  '585':         { weight_lbs: 20,   length_in: 23,   width_in: 15,   height_in: 12,   freight_class: '85' },
  'NOVA 3085':   { weight_lbs: 21,   length_in: 23,   width_in: 15,   height_in: 12,   freight_class: '85' },
  'R720':        { weight_lbs: 27,   length_in: 23.5, width_in: 15.5, height_in: 9.5,  freight_class: '85' },
  'VT1106':      { weight_lbs: 28,   length_in: 23.5, width_in: 15.5, height_in: 9.5,  freight_class: '85' },
  'NOVA 350N':   { weight_lbs: 20,   length_in: 24,   width_in: 16,   height_in: 8.5,  freight_class: '85' },
  'NOVA 800N':   { weight_lbs: 22.5, length_in: 24.5, width_in: 16.5, height_in: 9,    freight_class: '85' },
  'NOVA 350W':   { weight_lbs: 21.5, length_in: 24,   width_in: 16,   height_in: 8.5,  freight_class: '85' },
  'NOVA 800W':   { weight_lbs: 24,   length_in: 24.5, width_in: 16.5, height_in: 9,    freight_class: '85' },
  'ENPFS2001':   { weight_lbs: 15,   length_in: 14,   width_in: 11,   height_in: 10,   freight_class: '70' },
  'ENPFM2002':   { weight_lbs: 15.3, length_in: 14,   width_in: 11,   height_in: 10,   freight_class: '70' },
  'ENPFL2003':   { weight_lbs: 15.6, length_in: 14,   width_in: 11,   height_in: 10.2, freight_class: '70' },
  'ENPFXL2004':  { weight_lbs: 16,   length_in: 14,   width_in: 11,   height_in: 10.5, freight_class: '70' },
  'ENES2001':    { weight_lbs: 15.5, length_in: 14,   width_in: 11,   height_in: 10,   freight_class: '70' },
  'ENEM2002':    { weight_lbs: 15.8, length_in: 14,   width_in: 11,   height_in: 10,   freight_class: '70' },
  'ENEL2003':    { weight_lbs: 16.1, length_in: 14,   width_in: 11,   height_in: 10.2, freight_class: '70' },
  'ENEXL2004':   { weight_lbs: 16.5, length_in: 14,   width_in: 11,   height_in: 10.5, freight_class: '70' },
  '88047':       { weight_lbs: 37,   length_in: 13,   width_in: 13,   height_in: 13,   freight_class: '70' },
  'PP-28130':    { weight_lbs: 37,   length_in: 13,   width_in: 13,   height_in: 13,   freight_class: '70' },
};

function getProductDims(itemNumber) {
  return PRODUCT_DIMS[itemNumber] || DEFAULT_ITEM_DIMS;
}

// Build the freight items array from cart contents
function buildFreightItems(cartItems) {
  return cartItems.map(item => {
    const dims = getProductDims(item.itemNumber || '');
    const qty  = item.quantity || 1;
    return {
      description:  item.name || 'Supply Item',
      quantity:     qty,
      weight_lbs:   dims.weight_lbs * qty,
      length_in:    dims.length_in,
      width_in:     dims.width_in,
      height_in:    dims.height_in,
      freight_class: dims.freight_class,
    };
  });
}

// Fetch live LTL quotes from Warp sandbox
async function fetchFreightQuotes(destinationZip, cartItems) {
  if (!destinationZip || destinationZip.length < 5) return null;

  const items = buildFreightItems(cartItems);
  const totalWeight = items.reduce((s, i) => s + i.weight_lbs, 0);

  // Pickup date = next business day
  const pickup = nextBusinessDay();

  const payload = {
    origin_zip:       WARP_CONFIG.origin.zip,
    destination_zip:  destinationZip,
    pickup_date:      pickup,
    items,
    pallet_config: {
      length_in:      WARP_CONFIG.pallet.length_in,
      width_in:       WARP_CONFIG.pallet.width_in,
      max_weight_lbs: WARP_CONFIG.pallet.max_weight_lbs,
    },
  };

  try {
    const res = await fetch(`${WARP_CONFIG.baseUrl}/ltl/quote`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${WARP_CONFIG.apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Warp API error:', err);
      return null;
    }

    const data = await res.json();
    return data.quotes || data.rates || data || null;
  } catch (e) {
    console.error('Warp fetch failed:', e);
    return null;
  }
}

function nextBusinessDay() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // Skip weekend
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// ── UI helpers ──────────────────────────────────────────────────

let _quoteDebounce = null;
let _selectedQuote = null;

function initFreightQuoting() {
  const zipInput = document.getElementById('checkout-zip');
  const panel    = document.getElementById('freight-quote-panel');
  if (!zipInput || !panel) return;

  zipInput.addEventListener('input', () => {
    clearTimeout(_quoteDebounce);
    const zip = zipInput.value.replace(/\D/g, '').slice(0, 5);
    if (zip.length < 5) {
      renderQuotePanel(null, 'waiting');
      return;
    }
    renderQuotePanel(null, 'loading');
    _quoteDebounce = setTimeout(() => triggerQuote(zip), 600);
  });
}

async function triggerQuote(zip) {
  const cartItems = getCartItemsForFreight();
  if (!cartItems.length) {
    renderQuotePanel(null, 'empty-cart');
    return;
  }
  const quotes = await fetchFreightQuotes(zip, cartItems);
  renderQuotePanel(quotes, quotes ? 'results' : 'error');
}

function getCartItemsForFreight() {
  try {
    const cart = JSON.parse(localStorage.getItem('rrs_cart') || '[]');
    return cart.map(item => ({
      name:       item.name || item.productName || 'Item',
      itemNumber: item.itemNumber || item.sku || '',
      quantity:   item.quantity || 1,
    }));
  } catch { return []; }
}

function renderQuotePanel(quotes, state) {
  const panel = document.getElementById('freight-quote-panel');
  const shippingEl = document.getElementById('summary-shipping');
  if (!panel) return;

  if (state === 'waiting') {
    panel.innerHTML = `<p class="fq-hint">Enter your ZIP code above to see live freight rates.</p>`;
    if (shippingEl) shippingEl.textContent = 'TBD';
    _selectedQuote = null;
    return;
  }

  if (state === 'loading') {
    panel.innerHTML = `
      <div class="fq-loading">
        <svg class="fq-spinner" viewBox="0 0 24 24" fill="none" stroke="#ED7226" stroke-width="2.5">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
        </svg>
        <span>Getting live freight rates…</span>
      </div>`;
    return;
  }

  if (state === 'empty-cart') {
    panel.innerHTML = `<p class="fq-hint">Add products to your order to see shipping rates.</p>`;
    return;
  }

  if (state === 'error' || !quotes || !quotes.length) {
    panel.innerHTML = `
      <div class="fq-error">
        <strong>Unable to retrieve rates for this ZIP.</strong>
        <span>Our team will include shipping in your quote confirmation.</span>
      </div>`;
    if (shippingEl) shippingEl.textContent = 'Quoted separately';
    return;
  }

  // Sort by price ascending
  const sorted = [...quotes].sort((a, b) => (a.total_charge || a.price || 0) - (b.total_charge || b.price || 0));

  // Auto-select cheapest
  _selectedQuote = sorted[0];
  updateShippingSummary(_selectedQuote);

  const rows = sorted.slice(0, 5).map((q, i) => {
    const price    = q.total_charge || q.price || 0;
    const carrier  = q.carrier_name || q.carrier || 'Carrier';
    const transit  = q.transit_days != null ? `${q.transit_days} day${q.transit_days !== 1 ? 's' : ''}` : 'ETA TBD';
    const selected = i === 0 ? 'fq-option--selected' : '';
    return `
      <label class="fq-option ${selected}">
        <input type="radio" name="freight_quote" value="${i}" ${i === 0 ? 'checked' : ''}
               onchange="selectFreightQuote(${JSON.stringify(JSON.stringify(q))})">
        <div class="fq-option-body">
          <span class="fq-carrier">${carrier}</span>
          <span class="fq-transit">${transit}</span>
          <span class="fq-price">$${Number(price).toFixed(2)}</span>
        </div>
      </label>`;
  }).join('');

  panel.innerHTML = `
    <p class="fq-label">Select a shipping option:</p>
    <div class="fq-list">${rows}</div>
    <p class="fq-note">Sandbox rates shown. Live rates will be confirmed in your order.</p>`;
}

function selectFreightQuote(jsonStr) {
  try {
    _selectedQuote = JSON.parse(jsonStr);
    updateShippingSummary(_selectedQuote);
    // Highlight selected
    document.querySelectorAll('.fq-option').forEach(el => el.classList.remove('fq-option--selected'));
    const checked = document.querySelector('input[name="freight_quote"]:checked');
    if (checked) checked.closest('.fq-option').classList.add('fq-option--selected');
  } catch(e) { console.error(e); }
}

function updateShippingSummary(quote) {
  const shippingEl = document.getElementById('summary-shipping');
  const totalEl    = document.getElementById('summary-total');
  if (!quote || !shippingEl) return;

  const price = quote.total_charge || quote.price || 0;
  shippingEl.textContent = `$${Number(price).toFixed(2)}`;

  // Recalculate total
  const subtotalEl = document.getElementById('summary-subtotal');
  if (subtotalEl && totalEl) {
    const sub = parseFloat(subtotalEl.textContent.replace(/[^0-9.]/g, '')) || 0;
    totalEl.textContent = `$${(sub + Number(price)).toFixed(2)}`;
  }
}

// Expose selected quote for order submission
function getSelectedFreightQuote() {
  return _selectedQuote;
}
