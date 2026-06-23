// One-time seed: import all CSV products into Supabase
// Run with: node seed-products.mjs

const SUPABASE_URL  = 'https://giprkvlyouwfzjlaibkq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpcHJrdmx5b3V3ZnpqbGFpYmtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjA0ODUsImV4cCI6MjA5NjczNjQ4NX0.y0K_i9oN9DUNx_xIxUDWbvyXsubYIKpJR5un1yLtvvY';

const headers = {
  'apikey': SUPABASE_ANON,
  'Authorization': `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates'
};

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function price(str) {
  if (!str) return 0;
  const n = parseFloat(str.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function category(name, desc) {
  const t = (name + ' ' + desc).toLowerCase();
  if (t.includes('toilet') || t.includes('bathroom tissue')) return 'Toilet Paper';
  if (t.includes('facial tissue')) return 'Guest Room Supplies';
  if (t.includes('paper towel') || t.includes('kitchen roll') || t.includes('multifold') || t.includes('hardwound') || t.includes('center pull')) return 'Paper Towels';
  if (t.includes('trash') || t.includes('can liner') || t.includes('municipal liner')) return 'Trash Liners';
  if (t.includes('laundry') || t.includes('detergent')) return 'Laundry Supplies';
  if (t.includes('dish') || t.includes('pot & pan') || t.includes('powerball')) return 'Dishwashing Supplies';
  if (t.includes('hand soap') || t.includes('skin cleanser') || t.includes('lotion')) return 'Hand Soap';
  if (t.includes('glove') || t.includes('nitrile')) return 'Facility Supplies';
  return 'Cleaning Chemicals';
}

const products = [
  { name: 'Pure Bright® Germicidal Ultra Bleach', sku: '11008635042', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/pure-bright-germicidal-ultra-bleach.jpg', description: 'Germicidal Ultra Bleach — EPA registered disinfectant and sanitizer with kill claims on 50+ pathogens including C. Difficile Spore. 6% Sodium Hypochlorite.', price_val: 35.30, unit: 'Case', case_qty: 6, pack_size: '128 oz.' },
  { name: 'Professional Lysol® Disinfectant Spray', sku: '74828', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/professional-lysol-disinfectant-spray.jpg', description: 'Aerosol Crisp Linen® — Kills cold and flu viruses, mold allergens, and odor-causing bacteria. Hospital-grade germicidal spray.', price_val: 123.05, unit: 'Case', case_qty: 12, pack_size: '19 oz.' },
  { name: 'Clorox® Healthcare® Bleach Germicidal Cleaner', sku: '68970', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/clorox-healthcare-bleach-germicidal-cleaner.jpg', description: 'Bleach Germicidal Cleaner — Kills C. Difficile and C. auris in 3 minutes. One-step cleaner, disinfectant and deodorizer.', price_val: 97.45, unit: 'Case', case_qty: 6, pack_size: '32 oz.' },
  { name: 'CloroxPro™ Clorox® Disinfecting Wipes', sku: '31547', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/cloroxprotm-clorox-disinfecting-wipes.jpg', description: 'Fresh Scent — Kills 99.9% of germs. EPA approved for SARS-CoV-2. Bleach-free. Sanitizes in as little as 10 seconds.', price_val: 0, unit: 'Each', case_qty: 1, pack_size: '700 ct.' },
  { name: 'Sani Professional® Disinfecting Multi-Surface Wipe', sku: 'P22884', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/sani-professional-disinfecting-multi-surface-wipe.jpg', description: 'Canister — Kills 99.9% of bacteria in 15 seconds. Effective against 26 organisms. Alcohol and bleach free. Moisture-lock lid.', price_val: 0, unit: 'Case', case_qty: 6, pack_size: '200 ct.' },
  { name: 'Champion Sprayon® Vista Cleer™ Glass Cleaner', sku: '438-5155', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/champion-sprayon-vista-cleertm-glass-cleaner.jpg', description: 'Glass Cleaner — Foaming formula clings to vertical surfaces. No ammonia, alcohol, silicone or abrasives. Streak-free fast drying.', price_val: 0, unit: 'Case', case_qty: 12, pack_size: '20 oz.' },
  { name: 'Performance Plus™ Foaming Glass Cleaner', sku: 'P050', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/performance-plustm-foaming-glass-cleaner.jpg', description: 'Foaming Glass Cleaner — Cleans and polishes windows and mirrors. Long-lasting vertical cling. No ammonia, no rinsing required.', price_val: 0, unit: 'Case', case_qty: 12, pack_size: '19 oz.' },
  { name: 'Windex® Glass Indoor Blue Liquid Refill', sku: '316147', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/windex-glass-indoor-blue-liquid-refill.jpg', description: "America's #1 glass cleaner. Streak-free shine on glass, mirrors, and more. Convenient bulk refill format.", price_val: 0, unit: 'Case', case_qty: 6, pack_size: '67.6 oz.' },
  { name: 'Windex® Original w/Trigger Sprayer', sku: '313042', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/windex-original-w-trigger-sprayer.jpg', description: 'Ready-to-use trigger sprayer. Trusted streak-free shine on windows, mirrors and hard surfaces. Fast drying formula.', price_val: 0, unit: 'Case', case_qty: 8, pack_size: '23 oz.' },
  { name: 'Performance Plus™ Low Suds Powder Laundry Detergent', sku: 'PP40PAIL', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/performance-plustm-low-suds-powder-laundry-detergent.jpg', description: 'Heavy-duty powder laundry detergent. HE and standard machine compatible. Effective in hot, warm and cold water cycles.', price_val: 0, unit: 'Each', case_qty: 1, pack_size: '40 lb.' },
  { name: 'Purex® Mountain Breeze® Liquid Laundry Detergent', sku: '5016', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/purex-mountain-breeze-liquid-laundry-detergent.jpg', description: 'Mountain Breeze® liquid detergent with Dirt Lift Action™. 115 loads. Removes ground-in dirt and stains from fabric fibers.', price_val: 0, unit: 'Case', case_qty: 4, pack_size: '150 oz.' },
  { name: 'CloroxPro™ Pine-Sol® Multi-Surface Cleaner', sku: '60607', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/cloroxprotm-pine-sol-multi-surface-cleaner.jpg', description: 'Lemon Fresh — Cleans, deodorizes and disinfects in one step. Kills 99.9% of germs. 2X concentrated, makes up to 80 gallons.', price_val: 47.60, unit: 'Case', case_qty: 3, pack_size: '80 oz.' },
  { name: 'FINISH® Powerball® Deep Clean Dishwashing Tabs', sku: '97330', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/finish-powerball-deep-clean-dishwashing-tabs.jpg', description: 'Deep Clean Tabs with Pre-soaking Powerball. Cuts through grease, breaks down protein and starch stains. Oxygen-based bleach. Fresh scent.', price_val: 113.65, unit: 'Case', case_qty: 4, pack_size: '94 ct.' },
  { name: 'Dawn® Professional Manual Pot & Pan Detergent', sku: '70681', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/dawn-professional-manual-pot-and-pan-detergent-dish-soap.jpg', description: 'Original Scent — Cuts 100% of commercial grease. 2X longer-lasting suds. Fill up to 512 sinks per case. For commercial kitchens.', price_val: 138.85, unit: 'Each', case_qty: 1, pack_size: '5 Gal.' },
  { name: 'Performance Plus™ Low Density Can Liners', sku: 'PL385815B', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/performance-plustm-low-density-can-liners.jpg', description: 'Black 1.5 EQ mil — Superior stretch resistance, minimizes punctures and tears. Interleaved rolls. Commercial-grade durability.', price_val: 37.95, unit: 'Case', case_qty: 100, pack_size: '38 x 58' },
  { name: 'Inteplast HDPE Institutional Trash Can Liners', sku: 'S243308N', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/inteplast-hdpe-institutional-trash-can-liners.jpg', description: 'Natural 8 mic — For paper and non-sharp objects. Excellent puncture resistance. Star seal bottom. Compact coreless rolls.', price_val: 50.05, unit: 'Case', case_qty: 1000, pack_size: '24 x 33' },
  { name: 'NAPCO Black Heavy Duty Municipal Liners', sku: 'RM3858H', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/napco-black-heavy-duty-municipal-liners.jpg', description: '1.5N-H — Heaviest true gauge recycled can liners. Star seal bottom. Municipal-grade durability. Coreless rolls.', price_val: 40.25, unit: 'Case', case_qty: 100, pack_size: '38 x 58' },
  { name: 'NOVA® Black Repro Coreless Can Liners 1.2 mil 38x58', sku: 'NOVA519', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/nova-black-repro-coreless-can-liners.jpg', description: 'Black 1.2 mil — Up to 70% recycled content. Economical and environmentally conscious. Wide variety of waste disposal applications.', price_val: 39.45, unit: 'Case', case_qty: 100, pack_size: '38 x 58' },
  { name: 'NOVA® Black Repro Coreless Can Liners 1.6 mil 38x58', sku: 'NOVA523', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/nova-black-repro-coreless-can-liners.jpg', description: 'Black 1.6 mil — Up to 70% recycled content. Heavy-duty economical liner for a wide variety of waste disposal applications.', price_val: 52.45, unit: 'Case', case_qty: 100, pack_size: '38 x 58' },
  { name: 'NOVA® Black Repro Coreless Can Liners 1.2 mil 40x46', sku: 'NOVA517', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/nova-black-repro-coreless-can-liners.jpg', description: 'Black 1.2 mil — Up to 70% recycled content. Economical and environmentally conscious. 40 x 46 size.', price_val: 33.00, unit: 'Case', case_qty: 100, pack_size: '40 x 46' },
  { name: 'NOVA® Black Repro Coreless Can Liners 1.6 mil 43x47', sku: 'NOVA522', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/nova-black-repro-coreless-can-liners.jpg', description: 'Black 1.6 mil — Up to 70% recycled content. Heavy-duty 43 x 47 size for larger containers.', price_val: 48.15, unit: 'Case', case_qty: 100, pack_size: '43 x 47' },
  { name: 'Green® Heritage Pro 2-Ply Bathroom Tissue 500 Sheets', sku: '276', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/green-heritage-pro-2-ply-bathroom-tissue.jpg', description: '500 Sheets/Roll — SFI® Certified. Fast Flush® septic-safe. Soft 2-ply white tissue. Sustainable paper solution.', price_val: 54.45, unit: 'Case', case_qty: 96, pack_size: '4" x 3.1"' },
  { name: 'Green® Heritage Pro 2-Ply Bathroom Tissue 400 Sheets', sku: '248', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/green-heritage-pro-2-ply-bathroom-tissue.jpg', description: '400 Sheets/Roll — SFI® Certified. Fast Flush® septic-safe. Soft 2-ply white tissue. Sustainable paper solution.', price_val: 61.05, unit: 'Case', case_qty: 96, pack_size: '4.0" x 3.1"' },
  { name: 'Empress™ 2 Ply Facial Tissue Cube Box', sku: 'FT 30852', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/empresstm-2-ply-facial-tissue.jpg', description: 'Cube Box — Soft and gentle 2-ply facial tissue. Perfect for home, office, or on-the-go. Sheet size 7.75" x 7.5".', price_val: 0, unit: 'Case', case_qty: 36, pack_size: '85 ct.' },
  { name: 'Empress™ Virgin 2 Ply Facial Tissue Box', sku: 'FT 301002', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/empresstm-virgin-2-ply-facial-tissue.jpg', description: 'Box — Premium virgin fiber, soft and gentle. Bright white appearance. Sheet size 7.87" x 7.68".', price_val: 0, unit: 'Case', case_qty: 30, pack_size: '100 ct.' },
  { name: 'Livi® VPG® Select Cube Box Facial Tissue', sku: '11516', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/livi-vpg-select-cube-box-facial-tissue.jpg', description: '2 Ply — Luxurious softness from sustainable virgin-grown fiber. Naturally whiter and brighter sheet. Cube box format.', price_val: 0, unit: 'Case', case_qty: 36, pack_size: '90 ct.' },
  { name: 'Livi® VPG® Select Flat Box Facial Tissue', sku: '11513', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/livi-vpg-select-flat-box-facial-tissue.jpg', description: '2 Ply — Luxurious softness from sustainable virgin-grown fiber. Naturally whiter and brighter sheet. Flat box format.', price_val: 0, unit: 'Case', case_qty: 30, pack_size: '100 Sheets' },
  { name: 'Empress™ 2-Ply Center Pull Virgin Towel', sku: 'CP 660010', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/empresstm-2-ply-center-pull-virgin-towel.jpg', description: 'White 2 Ply — One-handed dispensing convenience. Fast water absorption. Virgin fiber quality. Commercial restroom ready.', price_val: 0, unit: 'Case', case_qty: 6, pack_size: '7.6" x 8.9"' },
  { name: 'Sofidel Double Layer Center Pull Towel', sku: '410081', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/sofidel-double-layer-center-pull-towel.jpg', description: 'White — Double-layer embossed virgin pulp. 600 towels per roll. 7.28" diameter. Reliable absorbency and performance.', price_val: 0, unit: 'Case', case_qty: 6, pack_size: "500'" },
  { name: 'Green® Heritage Pro Kitchen Roll Towel', sku: '585', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/green-heritage-pro-kitchen-roll-towel.jpg', description: '2 Ply — SFI® Certified. Strong absorbent performance. Sustainable kitchen roll with softness and visual appeal.', price_val: 0, unit: 'Case', case_qty: 30, pack_size: '85 ct.' },
  { name: 'NOVA® 2 Ply Kitchen Roll Towel', sku: 'NOVA 3085', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/nova-2-ply-kitchen-roll-towel.jpg', description: 'Roll White — Versatile and durable. Strong two-ply design handles spills while remaining gentle on surfaces. Reliable absorbency.', price_val: 0, unit: 'Case', case_qty: 30, pack_size: '85 ct.' },
  { name: 'Morcon® Morsoft® Multifold Towel Kraft', sku: 'R720', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/morcon-morsoft-multifold-towel.jpg', description: 'Kraft — Fits standard multifold dispensers. EPA-compliant post-consumer content. Economical for commercial restrooms and kitchens.', price_val: 0, unit: 'Case', case_qty: 4000, pack_size: '9.05" x 9.25"' },
  { name: 'Morcon® Valay® Multifold Towel White', sku: 'VT1106', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/morcon-valay-multifold-towel.jpg', description: 'White — Universal dispenser compatibility. EPA-compliant. Reliable drying for high-traffic restrooms, restaurants and breakrooms.', price_val: 0, unit: 'Case', case_qty: 4000, pack_size: '9.05" x 9.25"' },
  { name: 'NOVA® Hardwound Towel Kraft 8"x350\'', sku: 'NOVA 350N', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/nova-hardwound-towel.jpg', description: "Kraft — High-capacity roll for high-traffic areas. Reliable absorbency. Efficient dispensing system. 8\" x 350'.", price_val: 32.90, unit: 'Case', case_qty: 12, pack_size: "8\" x 350'" },
  { name: 'NOVA® Hardwound Towel Kraft 8"x800\'', sku: 'NOVA 800N', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/nova-hardwound-towel.jpg', description: "Kraft — High-capacity roll for high-traffic areas. Reliable absorbency. Efficient dispensing system. 8\" x 800'.", price_val: 42.05, unit: 'Case', case_qty: 6, pack_size: "8\" x 800'" },
  { name: 'NOVA® Hardwound Towel White 8"x350\'', sku: 'NOVA 350W', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/nova-hardwound-towel.jpg', description: "White — High-capacity roll for high-traffic areas. Reliable absorbency. Efficient dispensing system. 8\" x 350'.", price_val: 35.75, unit: 'Case', case_qty: 12, pack_size: "8\" x 350'" },
  { name: 'NOVA® Hardwound Towel White 8"x800\'', sku: 'NOVA 800W', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/nova-hardwound-towel.jpg', description: "White — High-capacity roll for high-traffic areas. Reliable absorbency. Efficient dispensing system. 8\" x 800'.", price_val: 43.85, unit: 'Case', case_qty: 6, pack_size: "8\" x 800'" },
  { name: 'Empress™ Blue Nitrile Powder Free Gloves Small', sku: 'ENPFS2001', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/empresstm-blue-nitrile-powder-free-gloves.jpg', description: 'Small Blue — Powder-free. Excellent tactile sensitivity. Suitable for medical, laboratory and food handling applications.', price_val: 43.45, unit: 'Case', case_qty: 1000, pack_size: 'Small' },
  { name: 'Empress™ Blue Nitrile Powder Free Gloves Medium', sku: 'ENPFM2002', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/empresstm-blue-nitrile-powder-free-gloves.jpg', description: 'Medium Blue — Powder-free. Excellent tactile sensitivity. Suitable for medical, laboratory and food handling applications.', price_val: 43.45, unit: 'Case', case_qty: 1000, pack_size: 'Medium' },
  { name: 'Empress™ Blue Nitrile Powder Free Gloves Large', sku: 'ENPFL2003', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/empresstm-blue-nitrile-powder-free-gloves.jpg', description: 'Large Blue — Powder-free. Excellent tactile sensitivity. Suitable for medical, laboratory and food handling applications.', price_val: 43.45, unit: 'Case', case_qty: 1000, pack_size: 'Large' },
  { name: 'Empress™ Blue Nitrile Powder Free Gloves XL', sku: 'ENPFXL2004', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/empresstm-blue-nitrile-powder-free-gloves.jpg', description: 'XL Blue — Powder-free. Excellent tactile sensitivity. Suitable for medical, laboratory and food handling applications.', price_val: 43.45, unit: 'Case', case_qty: 1000, pack_size: 'XL' },
  { name: 'Empress™ Exam Grade Blue Nitrile Gloves Small', sku: 'ENES2001', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/empresstm-exam-grade-blue-nitrile-powder-free-gloves.jpg', description: 'Small Blue — Exam-grade protection. Powder-free. Chemical and puncture resistant. Meets stringent medical standards.', price_val: 45.20, unit: 'Case', case_qty: 1000, pack_size: 'Small' },
  { name: 'Empress™ Exam Grade Blue Nitrile Gloves Medium', sku: 'ENEM2002', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/empresstm-exam-grade-blue-nitrile-powder-free-gloves.jpg', description: 'Medium Blue — Exam-grade protection. Powder-free. Chemical and puncture resistant. Meets stringent medical standards.', price_val: 45.20, unit: 'Case', case_qty: 1000, pack_size: 'Medium' },
  { name: 'Empress™ Exam Grade Blue Nitrile Gloves Large', sku: 'ENEL2003', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/empresstm-exam-grade-blue-nitrile-powder-free-gloves.jpg', description: 'Large Blue — Exam-grade protection. Powder-free. Chemical and puncture resistant. Meets stringent medical standards.', price_val: 45.20, unit: 'Case', case_qty: 1000, pack_size: 'Large' },
  { name: 'Empress™ Exam Grade Blue Nitrile Gloves XL', sku: 'ENEXL2004', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/empresstm-exam-grade-blue-nitrile-powder-free-gloves.jpg', description: 'XL Blue — Exam-grade protection. Powder-free. Chemical and puncture resistant. Meets stringent medical standards.', price_val: 45.20, unit: 'Case', case_qty: 1000, pack_size: 'XL' },
  { name: 'Dial® Gold Antimicrobial Liquid Hand Soap', sku: '88047', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/dial-gold-antimicrobial-liquid-hand-soap.jpg', description: 'Antimicrobial Liquid Hand Soap — Kills 99.9% of germs. Dermatologist-tested. Gentle formula for frequent handwashing. 1 gallon.', price_val: 0, unit: 'Case', case_qty: 4, pack_size: 'Gal.' },
  { name: 'Performance Plus™ White Lotion Skin Cleanser', sku: 'PP-28130', image_url: 'https://res.cloudinary.com/ddx3g4yse/image/upload/performance-plustm-white-lotion-skin-cleanser.jpg', description: 'White Lotion Skin Cleanser — Mild detergents and emollients. Leaves skin soft and smooth. Pleasant almond fragrance. 1 gallon.', price_val: 0, unit: 'Case', case_qty: 4, pack_size: 'Gal.' },
];

const payload = products.map(p => ({
  name:          p.name,
  slug:          slug(p.name),
  sku:           p.sku || null,
  category_name: category(p.name, p.description),
  description:   p.description,
  price:         p.price_val,
  sale_price:    null,
  is_on_sale:    false,
  unit:          p.unit,
  case_qty:      p.case_qty,
  pack_size:     p.pack_size ? parseInt(p.pack_size) || 1 : 1,
  image_url:     p.image_url,
  is_featured:   false,
  is_active:     true,
  updated_at:    new Date().toISOString(),
}));

async function seed() {
  console.log(`Inserting ${payload.length} products...`);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('❌ Error:', res.status, text);
    return;
  }

  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  const count = Array.isArray(data) ? data.length : '?';
  console.log(`✅ Done! ${count} products upserted into Supabase.`);

  // Also upsert inventory (all in_stock, qty 100 as default)
  if (Array.isArray(data) && data.length > 0) {
    const inv = data.map(p => ({
      product_id: p.id,
      stock_qty:  100,
      status:     'in_stock',
      updated_at: new Date().toISOString(),
    }));
    const invRes = await fetch(`${SUPABASE_URL}/rest/v1/inventory`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(inv),
    });
    console.log(invRes.ok ? `✅ Inventory records created.` : `⚠️  Inventory insert: ${invRes.status}`);
  }
}

seed();
