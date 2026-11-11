/* Linen presentation helpers -- towels, washcloths, bath mats, sheets,
 * pillowcases and duvet covers (CEO direction, 2026-11-08, modelled on how
 * hospitality buyers search DFW Motel Supply):
 *
 *   - Towel titles read  Size / Type, Quality, Weight - Color
 *       "24 × 48 in. Bath Towel, Economy Quality, 8 lb/Dozen – White"
 *   - Bedding titles read Brand / Thread count / Type - Size, Color, Fabric
 *       "Prestige T-200 Hospitality Fitted Sheet – Queen 60 × 80 in., ..."
 *   - Every towel option shows its weight per dozen, the way managers
 *     compare towels ("13 × 13 in. - 1.5 lb/Dozen - Pack of 12").
 *   - Product details are a labelled list (Dimensions, Weight, Material,
 *     Color, Packaging...), with Packaging explaining the pack instead of
 *     quoting a minimum order.
 *   - Size options run smallest to biggest: Twin, Twin XL, Full, Full XL,
 *     Queen, Queen XL, King, California King.
 *
 * One file, loaded by every page before script.js (window.RRSLinen) and
 * required by api/product-meta.js, so the server-rendered <title>/H1 and the
 * browser's can never disagree. Accepts both product shapes: script.js's
 * camelCase objects and the raw snake_case products_public rows.
 */
(function (root) {
  "use strict";

  // Weight per dozen, in pounds. Starlinen: their Hospitality catalog
  // (StarLinenUSA_Hospitality.pdf, terry collection, "Weight (lbs)" per
  // dozen). The weight column on the product row is the SHIPPING weight
  // (it carries packaging, and one washcloth pack reads 8 lb), so it is
  // never used for this. InnStyle: the lb/dozen stated in each product's
  // own supplier copy.
  const LB_PER_DOZEN = {
    // Starlinen Value (Economy)
    "11092WH400": 10, "11079WH400": 8, "11054WH400": 6, "11023WH400": 3,
    "11012WH400": 1, "11130WH400": 7,
    // Starlinen Lexington (Premium)
    "19300WH098": 10.5, "19301WH098": 8, "19302WH098": 6.5, "19303WH098": 3.25,
    "19304WH098": 1, "19305WH098": 7,
    // Starlinen Grand (Grand Luxury)
    "18209WH098": 17, "18205WH098": 14, "18206WH098": 4.5, "18207WH098": 1.5,
    "18208WH098": 9,
    // Starlinen Optima (Ultra Luxury)
    "18300WH099": 17, "18301WH099": 14, "18303WH099": 4.5, "18304WH099": 1.75,
    "18305WH099": 1.5, "18306WH099": 10,
    // Simplicity (Luxury) -- weight is in the product name too
    "7136054": 17, "7136631": 14, "7136051": 4.5, "7136052": 1.5,
    // InnStyle Prestige
    "BT2750RC48": 14, "BT2754RC36": 17, "BT3060RDC24": 17, "HT1630RC120": 4,
    "WC1313RC300": 1.5, "BM2030RC60": 7, "BM2234RC60": 9.5,
    "BT3056SC12": 18, "HT1628SC24": 5.5, "WC1313SC48": 2.1, "BM2035SC12": 10,
    "BT2758LC14": 18, "HT1630LC42": 6, "WC1313LC110": 2.2, "BM2234LC20": 12,
    "BS3060LC12": 20,
  };

  // Starlinen terry construction, from the same catalog, by SKU prefix.
  const STARLINEN_TOWEL_MATERIAL = [
    [/^11\d{3}WH/i, "100% cotton with a cam border"],
    [/^19\d{3}WH/i, "86/14 cotton-poly blend, ring-spun, with a cam border"],
    [/^182\d{2}WH/i, "100% ring-spun cotton with a dobby border"],
    [/^183\d{2}WH/i, "100% long-staple combed cotton, ring-spun"],
  ];

  // Starlinen Percale Elegance sheets: T180 is a 55/45 blend, T200 and T250
  // are 60/40 (same catalog, Sheets and Pillowcases page).
  const STARLINEN_SHEET_BLEND = { "180": "55/45", "200": "60/40", "250": "60/40" };

  // Smallest to biggest. "California King"/"Cal King" before plain "King" in
  // the matcher so it is not read as King; order values are what sort.
  const BED_SIZES = [
    ["california king", 90], ["cal king", 90], ["hotel king", 72],
    ["king xl", 82], ["king", 80], ["queen extra-wide", 63], ["queen xl", 62],
    ["queen", 60], ["full/queen", 55], ["full xl", 42], ["full", 40],
    ["twin xl", 22], ["twin", 20], ["standard", 10],
  ];

  const pick = (p, camel, snake) => (p && (p[camel] != null && p[camel] !== "" ? p[camel] : p[snake])) || "";

  function fields(p) {
    return {
      sku: String(pick(p, "itemNumber", "sku")).trim(),
      name: String(pick(p, "name", "name")),
      tier: String(pick(p, "productTier", "product_tier")).trim(),
      family: String(pick(p, "familyKey", "family_key")),
      overview: String(pick(p, "overview", "overview")),
      description: String(pick(p, "description", "description")),
      features: [1, 2, 3, 4].map(i => String(pick(p, "feature" + i, "feature" + i))).filter(Boolean),
      category: String(pick(p, "category", "category_name")),
    };
  }

  const TOWEL_RE = /\b(bath towels?|hand towels?|washcloths?|bath mats?|bath sheets?)\b/i;
  const BEDDING_RE = /\b(flat sheets?|fitted sheets?|pillowcases?|pillow cases?|duvet covers?)\b/i;
  // Kitchen/bar/dish towels are foodservice linens, not guest towels.
  const NOT_TOWEL_RE = /\b(bar mops?|bar towels?|kitchen|dish cloths?|pot holders?|paper|roll towels?)\b/i;

  function kind(p) {
    const f = fields(p);
    if (TOWEL_RE.test(f.name) && !NOT_TOWEL_RE.test(f.name)) return "towel";
    if (BEDDING_RE.test(f.name)) return "bedding";
    return "";
  }

  function towelType(name) {
    const m = name.match(TOWEL_RE);
    if (!m) return "";
    const t = m[1].toLowerCase().replace(/s$/, "");
    return { "bath towel": "Bath Towel", "hand towel": "Hand Towel", "washcloth": "Washcloth", "bath mat": "Bath Mat", "bath sheet": "Bath Sheet" }[t] || "";
  }

  function beddingType(name) {
    const m = name.match(BEDDING_RE);
    if (!m) return "";
    const t = m[1].toLowerCase().replace(/ case/, "case").replace(/s$/, "");
    return { "flat sheet": "Flat Sheet", "fitted sheet": "Fitted Sheet", "pillowcase": "Pillowcase", "duvet cover": "Duvet Cover" }[t] || "";
  }

  // "24 × 48 in." / "60 × 80 in." -- first W × H pair in the name.
  function dims(name) {
    const m = name.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)(?:\s*[×x]\s*\d+(?:\.\d+)?)?\s*(?:in\.?|")?/i);
    return m ? { w: Number(m[1]), h: Number(m[2]), text: `${m[1]} × ${m[2]} in.` } : null;
  }

  function pocket(name) {
    const m = name.match(/(\d+)\s*in\.?\s*Pocket/i);
    return m ? Number(m[1]) : 0;
  }

  function bedSize(text) {
    const low = String(text || "").toLowerCase();
    for (const [word, rank] of BED_SIZES) {
      const re = new RegExp("(^|[^a-z])" + word.replace(/[/-]/g, "\\$&") + "([^a-z]|$)");
      if (re.test(low)) return { word, rank };
    }
    return null;
  }

  function titleCase(s) {
    return s.replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\bXl\b/g, "XL");
  }

  function packText(name) {
    const m = name.match(/(Pack of \d+|Case of \d+(?: Pieces)?|1 Piece|1 Each)/i);
    return m ? m[1] : "";
  }

  function color(f) {
    const m = f.name.match(/\b((?:Fresh |Soft |Solid )?White(?: 1 cm Stripe)?|Bone|Ecru|Beige)\b/i);
    if (m) return m[1];
    if (/\bwhite\b/i.test(f.overview + " " + f.features.join(" "))) return "White";
    return "";
  }

  function lbPerDozen(p) {
    const f = fields(p);
    if (LB_PER_DOZEN[f.sku] != null) return LB_PER_DOZEN[f.sku];
    const m = (f.name + " " + f.overview).match(/(\d+(?:\.\d+)?)\s*lbs?\s*(?:\/|per)\s*(?:dozen|dz)/i);
    return m ? Number(m[1]) : null;
  }

  function fmtLb(n) {
    return `${Number(n).toString()} lb/Dozen`;
  }

  // Display tier word for a towel: "Economy" -> "Economy Quality".
  function towelQuality(p) {
    const f = fields(p);
    if (f.tier) return f.tier;
    const m = f.name.match(/^Prestige\s+(Luxury Turkish|Suites|Ringspun)/i);
    if (m) return "Prestige " + ({ ringspun: "Ring-Spun", suites: "Suites", "luxury turkish": "Turkish Luxury" }[m[1].toLowerCase()] || m[1]);
    return "";
  }

  function threadCount(p) {
    const f = fields(p);
    const m = (f.tier + " " + f.name).match(/\bT-?(\d{3})\b|^(\d{3})\b/);
    return m ? (m[1] || m[2]) : "";
  }

  function brand(f) {
    const m = f.name.match(/^(Prestige|Martex|Five Star|Millennium|Simplicity|Optima)\b/i);
    return m ? m[1] : "";
  }

  function fabric(p, tc) {
    const f = fields(p);
    const text = f.overview + " " + f.features.join(" ");
    const m = text.match(/(\d{2})%\s*cotton[^.]{0,20}?(\d{2})%\s*(?:spun\s+)?poly/i);
    let blend = m ? `${m[1]}/${m[2]}` : "";
    if (!blend && /cotton blend/i.test(f.name) && STARLINEN_SHEET_BLEND[tc] && /WH\d{3}$|WW\d{3}$/i.test(f.sku)) blend = STARLINEN_SHEET_BLEND[tc];
    const percale = /percale/i.test(text) || (/WH402$/i.test(f.sku));
    if (blend) return `${blend} Cotton-Poly${percale ? " Percale" : " Blend"}`;
    if (/microfiber/i.test(f.name)) return "Microfiber";
    if (/cotton blend/i.test(f.name)) return "Cotton-Poly Blend";
    return "";
  }

  function towelMaterial(p) {
    const f = fields(p);
    for (const [re, text] of STARLINEN_TOWEL_MATERIAL) if (re.test(f.sku)) return text;
    const t = f.overview + " " + f.features.join(" ");
    const m = t.match(/100%\s+([a-z\- ]*cotton)/i);
    if (m) return "100% " + m[1].toLowerCase().replace("ringspun", "ring-spun");
    if (/ring-?spun cotton/i.test(f.name)) return "Ring-spun cotton";
    if (/cotton blend/i.test(f.name)) return "Cotton blend";
    if (/cotton/i.test(f.name)) return "Cotton";
    return "";
  }

  /* ── Titles ─────────────────────────────────────────────────────── */

  // Returns "" when the product is not a linen this applies to (or lacks
  // what the format needs) -- callers keep their existing title then.
  function seoTitle(p) {
    const f = fields(p);
    const k = kind(p);
    if (k === "towel") {
      const d = dims(f.name), type = towelType(f.name);
      if (!d || !type) return "";
      const parts = [`${d.text} ${type}`];
      const q = towelQuality(p);
      if (q) parts.push(`${q} Quality`);
      const lb = lbPerDozen(p);
      if (lb) parts.push(fmtLb(lb));
      const c = color(f);
      // A family can repeat size/quality/weight across pack sizes (InnStyle
      // sells some by the piece and by the case), so the pack is kept when
      // it is a case pack -- every title has to name exactly one SKU.
      const pack = /^Case of/i.test(packText(f.name)) ? packText(f.name) : "";
      return parts.join(", ") + (c ? ` – ${c}` : "") + (pack ? `, ${pack}` : "");
    }
    if (k === "bedding") {
      const tc = threadCount(p), type = beddingType(f.name);
      if (!tc || !type) return "";
      const b = brand(f);
      const line = /hospitality/i.test(f.name + " " + f.tier) ? " Hospitality" : "";
      const bs = bedSize(f.name);
      const d = dims(f.name);
      const sizeBits = [bs ? titleCase(bs.word) : "", d ? d.text : ""].filter(Boolean).join(" ");
      const pk = pocket(f.name);
      const tail = [
        sizeBits,
        pk ? `${pk} in. Pocket` : "",
        color(f),
        fabric(p, tc),
        // Case packs and single pieces of the same sheet are separate SKUs
        // (InnStyle), so their pack stays in the title; a dozen pack is the
        // only way the dozen-sold lines come and adds nothing.
        /Pieces|1 Piece|1 Each/i.test(packText(f.name)) ? packText(f.name) : "",
      ].filter(Boolean);
      return `${b ? b + " " : ""}T-${tc}${line} ${type} – ${tail.join(", ")}`;
    }
    return "";
  }

  /* ── Option labels ──────────────────────────────────────────────── */

  // Towel option labels get the weight per dozen when they don't carry it
  // already; InnStyle labels ("Case of 36") also get the size, which they
  // lack. Anything else is returned unchanged.
  function optionLabel(p, label) {
    label = String(label || "");
    // Eric (2026-11-12): no "Pack of 12" / "Case of 12" in the option
    // buttons of dozen-sold linens -- they are priced and sold by the dozen,
    // so the pack wording only adds case language. Case packs of pieces
    // ("Case of 36") stay: they tell apart SKUs of different sizes.
    if (kind(p) === "bedding" || kind(p) === "towel") {
      label = label.split(" - ").map(s => s.trim()).filter(s => s && !/^(Pack|Case) of 12$/i.test(s)).join(" - ");
    }
    if (kind(p) !== "towel") return label;
    const f = fields(p);
    const lb = lbPerDozen(p);
    const d = dims(f.name);
    let parts = label.split(" - ").map(s => s.trim()).filter(Boolean);
    // Size leads: "Case of 60 - 20 × 30 in." reads as a pack, not a towel.
    const dimAt = parts.findIndex(s => /\d\s*[×x]\s*\d/.test(s));
    if (dimAt > 0) parts.unshift(parts.splice(dimAt, 1)[0]);
    else if (dimAt === -1 && d) parts.unshift(d.text);
    if (lb && !/lb\s*\/\s*dozen/i.test(label)) {
      const at = parts.findIndex(s => /\d\s*[×x]\s*\d/.test(s));
      parts.splice(at + 1, 0, fmtLb(lb));
    }
    return parts.join(" - ");
  }

  /* ── Size order ─────────────────────────────────────────────────── */

  // Sort key, smaller first. null when nothing size-like is found, so the
  // caller can keep its own order for non-linen families.
  function sizeKey(p, label) {
    const text = String(label || "") + " " + fields(p).name;
    const bs = bedSize(label) || bedSize(fields(p).name);
    const d = dims(text);
    if (!bs && !d) return null;
    return [
      bs ? bs.rank : 0,
      d ? d.w * d.h : 0,
      pocket(text),
      /1 Piece|1 Each/i.test(text) ? 0 : 1,
    ];
  }

  function compareSizeKeys(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  /* ── Thread count badge for a catalog card ──────────────────────── */

  // "T180 · T200 · T250" for a family spanning thread counts; "" when the
  // family isn't bedding with thread counts.
  function threadCountBadge(variants) {
    const tcs = [...new Set((variants || []).map(threadCount).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b));
    if (!tcs.length) return "";
    // Bedding by type, or anything (comforters) naming its own "T233".
    if (!(variants || []).some(v => kind(v) === "bedding" || /\bT-?\d{3}\b/.test(fields(v).name))) return "";
    return tcs.map(t => "T" + t).join(" · ");
  }

  /* ── Product details list ───────────────────────────────────────── */

  // [{label, value}] for the product page's details card, or [] when the
  // product isn't a linen this covers.
  function details(p) {
    const f = fields(p);
    const k = kind(p);
    const out = [];
    const add = (label, value) => { if (value) out.push({ label, value }); };
    const pack = packText(f.name);
    const caseN = (pack.match(/Case of (\d+)/i) || [])[1];

    if (k === "towel") {
      const d = dims(f.name);
      const lb = lbPerDozen(p);
      add("Dimensions", d && d.text);
      add("Weight", lb ? `${lb} lbs per dozen` : "");
      add("Quality", towelQuality(p));
      add("Material", towelMaterial(p));
      add("Color", color(f));
      if (/Pack of 12/i.test(pack)) {
        add("Packaging", "Sold by the dozen: 12 towels. Towels are counted, priced and reordered by the dozen, ready for your linen-room par.");
      } else if (caseN) {
        add("Packaging", `${caseN} pieces per case, priced per piece. Packed by the case for efficient bulk ordering, shipping and linen-room storage.`);
      }
      add("Care", "Machine washable for on-premise or commercial laundry");
      return out;
    }
    if (k === "bedding") {
      const tc = threadCount(p);
      const bs = bedSize(f.name);
      const d = dims(f.name);
      const pk = pocket(f.name);
      add("Brand", brand(f));
      add("Thread Count", tc ? `T-${tc}` : "");
      add("Pattern", /stripe/i.test(f.name) ? "Stripe" : "Solid");
      add("Size", [bs ? titleCase(bs.word) : "", d ? d.text : "", pk ? `${pk} in. pocket` : ""].filter(Boolean).join(", "));
      add("Material", fabric(p, tc));
      add("Color", color(f));
      if (/Pack of 12|Case of 12$/i.test(pack) && !/Pieces/i.test(pack)) {
        add("Packaging", "Sold by the dozen: 12 pieces. Bedding is priced and reordered by the dozen to match how housekeeping stocks rooms.");
      } else if (caseN) {
        add("Packaging", `${caseN} pieces per case, priced per piece. Packed by the case for efficient bulk ordering and linen-room storage.`);
      } else if (/1 Piece|1 Each/i.test(pack) || !pack) {
        add("Packaging", "Sold individually.");
      }
      return out;
    }
    return out;
  }

  function applications(p) {
    const k = kind(p);
    if (k === "towel") return "Ideal for hotels, motels, inns, vacation rentals, gyms and other hospitality or commercial settings where reliable, durable towels are essential.";
    if (k === "bedding") return "Built for hotels, motels, inns, extended-stay properties and vacation rentals that need bedding able to stand up to frequent commercial laundering.";
    return "";
  }

  const api = { kind, seoTitle, optionLabel, sizeKey, compareSizeKeys, threadCount, threadCountBadge, details, applications, lbPerDozen };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RRSLinen = api;
})(typeof window !== "undefined" ? window : this);
