/**
 * Per-IP rate limiting for the serverless endpoints.
 *
 * Scope, stated honestly: this is an in-memory counter inside one warm
 * Vercel lambda instance. It is NOT a defence against a real distributed
 * attack -- a botnet spreads across many source IPs and Vercel spreads
 * requests across many instances, so neither the key nor the counter
 * holds. Volumetric DDoS is absorbed upstream by Vercel's edge, and
 * Attack Challenge Mode / WAF rules in the Vercel dashboard are the
 * actual control for that.
 *
 * What it DOES stop is the cheap single-source abuse this site is
 * genuinely exposed to: one script hammering /api/create-payment-intent
 * in a loop to run up Stripe objects and burn the Hobby plan's function
 * quota. That traffic usually lands on a warm instance and gets counted.
 *
 * If this ever needs to be real, the replacement is a shared store
 * (Upstash/Vercel KV) keyed the same way -- the call signature here is
 * deliberately the same shape that would take.
 */

// key -> { count, resetAt }. Bounded below so a spray of unique IPs
// cannot grow this without limit.
const buckets = new Map();
const MAX_BUCKETS = 10000;

function clientIp(req) {
  // x-forwarded-for is attacker-controllable in general, but on Vercel the
  // edge overwrites it, and the left-most entry is the real client.
  const xff = req.headers['x-forwarded-for'] || '';
  const first = String(xff).split(',')[0].trim();
  return first || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function sweep(now) {
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
  // Still oversized after dropping expired entries: drop oldest-resetting
  // first. Evicting a live bucket only ever forgives requests, never
  // invents them, so this fails open rather than locking anyone out.
  if (buckets.size > MAX_BUCKETS) {
    const sorted = Array.from(buckets.entries()).sort((a, b) => a[1].resetAt - b[1].resetAt);
    const drop = buckets.size - MAX_BUCKETS;
    for (let i = 0; i < drop; i++) buckets.delete(sorted[i][0]);
  }
}

/**
 * Returns true if the request may proceed. On refusal it sends a 429
 * (with Retry-After) and returns false -- the caller returns immediately:
 *
 *   if (!rateLimit(req, res, { limit: 10, windowMs: 60000 })) return;
 */
function rateLimit(req, res, opts = {}) {
  const limit = opts.limit || 30;
  const windowMs = opts.windowMs || 60000;
  const key = (opts.bucket || 'default') + ':' + clientIp(req);
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS / 2) sweep(now);

  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;

  const remaining = Math.max(0, limit - b.count);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  if (b.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    return false;
  }
  return true;
}

module.exports = rateLimit;
module.exports.rateLimit = rateLimit;
module.exports.clientIp = clientIp;
