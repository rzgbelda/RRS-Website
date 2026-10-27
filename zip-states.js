/**
 * Which US state a 5-digit ZIP belongs to, from its first three digits
 * (USPS ZIP3 prefix ranges). Same dual-load pattern as tax-rates.js: a
 * plain <script> on cart/checkout pages (window.zipStateFor,
 * window.isKnownZip) and require()d by api/_lib/price-cart.js.
 *
 * Used for two things only (2026-10-28 website audit):
 *  - checkout warns when the ZIP and the selected state disagree (H1);
 *  - a ZIP whose prefix belongs to no state (00000, 99999...) is reported
 *    as "check your ZIP" instead of a carrier failure, and does not email
 *    a shipping alert (M4).
 * A prefix range is a state's whole block, including a few unassigned
 * prefixes inside it, so this never rejects a real ZIP -- it only catches
 * ZIPs no carrier could deliver to.
 */
const ZIP3_STATE_RANGES = [
  // [first, last, state]
  [5, 5, 'NY'], [6, 9, 'PR'],
  [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'],
  [50, 59, 'VT'], [55, 55, 'MA'], [60, 69, 'CT'], [70, 89, 'NJ'],
  [90, 99, 'AE'],
  [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'],
  [200, 200, 'DC'], [201, 201, 'VA'], [202, 205, 'DC'], [206, 219, 'MD'],
  [220, 246, 'VA'], [247, 268, 'WV'], [270, 289, 'NC'], [290, 299, 'SC'],
  [300, 319, 'GA'], [320, 339, 'FL'], [340, 340, 'AA'], [341, 342, 'FL'],
  [344, 344, 'FL'], [346, 347, 'FL'], [349, 349, 'FL'],
  [350, 369, 'AL'], [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'],
  [400, 427, 'KY'], [430, 459, 'OH'], [460, 479, 'IN'], [480, 499, 'MI'],
  [500, 528, 'IA'], [530, 549, 'WI'], [550, 567, 'MN'], [569, 569, 'DC'],
  [570, 577, 'SD'], [580, 588, 'ND'], [590, 599, 'MT'],
  [600, 629, 'IL'], [630, 658, 'MO'], [660, 679, 'KS'], [680, 693, 'NE'],
  [700, 714, 'LA'], [716, 729, 'AR'], [730, 731, 'OK'], [733, 733, 'TX'],
  [734, 749, 'OK'], [750, 799, 'TX'],
  [800, 816, 'CO'], [820, 831, 'WY'], [832, 838, 'ID'], [840, 847, 'UT'],
  [850, 865, 'AZ'], [870, 884, 'NM'], [885, 885, 'TX'], [889, 898, 'NV'],
  [900, 961, 'CA'], [962, 966, 'AP'], [967, 968, 'HI'], [969, 969, 'GU'],
  [970, 979, 'OR'], [980, 994, 'WA'], [995, 999, 'AK'],
];

// '27962' -> 'NC'; '' for a malformed ZIP or a prefix no state uses.
function zipStateFor(zip) {
  const z = String(zip || '').trim();
  if (!/^\d{5}$/.test(z)) return '';
  const p = Number(z.slice(0, 3));
  // MA's 055 sits inside VT's 050-059 block, so it is checked first.
  if (p === 55) return 'MA';
  for (const [a, b, st] of ZIP3_STATE_RANGES) if (p >= a && p <= b) return st;
  return '';
}

function isKnownZip(zip) {
  return zipStateFor(zip) !== '';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { zipStateFor, isKnownZip };
}
if (typeof window !== 'undefined') {
  window.zipStateFor = zipStateFor;
  window.isKnownZip = isKnownZip;
}
