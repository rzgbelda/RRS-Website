const { createClient } = require('@supabase/supabase-js');

/**
 * Auth guard for the serverless endpoints that hold the service role key.
 *
 * Why this exists: the service role key bypasses RLS completely. Any
 * endpoint holding it that doesn't check who is calling is, in effect, a
 * public write API into the database -- the RLS policies protecting every
 * table simply don't apply on that path. A security pass found four such
 * endpoints reachable by anyone on the internet (admin-create-quote,
 * lookup-payment-proof, send-terms-agreement, notify-ticket).
 *
 * Usage, as the first thing in the handler:
 *
 *   const requireStaff = require('./_lib/require-staff');
 *   ...
 *   const staff = await requireStaff(req, res);
 *   if (!staff) return;            // guard already sent 401/403
 *
 * The caller's own access token is what gets verified -- never a role or
 * email passed in the request body, which the client controls and can
 * therefore forge.
 */
module.exports = async function requireStaff(req, res, opts = {}) {
  const allowedRoles = opts.roles || ['owner', 'admin', 'marketing', 'developer'];

  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('[require-staff] Supabase env vars not configured');
    res.status(500).json({ error: 'Server not configured' });
    return null;
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Verify the token is real and unexpired by asking Supabase to resolve it
  // to a user. A forged or stale token fails here.
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }

  // Role comes from the profiles table, read server-side -- not from the
  // JWT's user_metadata, which a user can edit on their own account.
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('id', userData.user.id)
    .single();

  if (profileErr || !profile) {
    res.status(403).json({ error: 'No profile found for this account' });
    return null;
  }

  if (!allowedRoles.includes(profile.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }

  return { user: userData.user, profile, supabase };
};
