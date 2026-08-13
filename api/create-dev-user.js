// Creates a developer account for the ticket board.
//
// This endpoint mints a login that can reach the admin panel, so it verifies
// the CALLER is an admin before doing anything -- using their access token
// against the database, never a role claim sent in the request body. Follows
// the same shape as the existing create-subdist-user Edge Function, but lives
// as a Vercel function so it deploys with the site.

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'Supabase is not configured on the server.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { email, password, full_name } = body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // --- Authorize the caller -------------------------------------------
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Not signed in.' });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: caller, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller?.user) return res.status(401).json({ error: 'Invalid session.' });

    const { data: callerProfile } = await admin
      .from('profiles').select('role').eq('id', caller.user.id).single();

    if (callerProfile?.role !== 'admin') {
      return res.status(403).json({ error: 'Only an administrator can create developer accounts.' });
    }

    // --- Create the account ---------------------------------------------
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) return res.status(400).json({ error: createErr.message });

    const { error: profileErr } = await admin.from('profiles').upsert({
      id: created.user.id,
      email,
      role: 'developer',
      contact_name: full_name || email,
    });

    if (profileErr) {
      // Don't leave a login that can't be authorized: undo the auth user.
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return res.status(400).json({ error: profileErr.message });
    }

    return res.status(200).json({ success: true, user_id: created.user.id, email });
  } catch (err) {
    console.error('create-dev-user failed:', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
};
