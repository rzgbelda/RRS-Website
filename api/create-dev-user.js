// Creates a staff account (developer or marketing) for the admin panel.
//
// This endpoint mints a login that can reach the admin panel, so it verifies
// the CALLER is an admin before doing anything -- using their access token
// against the database, never a role claim sent in the request body. Follows
// the same shape as the existing create-subdist-user Edge Function, but lives
// as a Vercel function so it deploys with the site.
//
// Handles both developer and marketing accounts (not just developer, despite
// the filename) rather than adding a second near-identical endpoint --
// Vercel's Hobby plan caps serverless functions at 12, and this project was
// already at 11 before the Marketing Account work started.

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
    const role = body.role === 'marketing' ? 'marketing' : 'developer'; // allow-list, not a passthrough

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
      return res.status(403).json({ error: 'Only an administrator can create staff accounts.' });
    }

    // --- Create the account, OR promote an existing one ------------------
    // A staff member is often already a real customer/user in the system
    // (they placed an order, or an account was made for them some other
    // way) before they're made staff -- createUser then fails with "already
    // registered" instead of doing anything useful. Rather than dead-end
    // there, find that existing auth user and promote them: set their role,
    // and reset their password to the one just entered here (this modal
    // exists specifically to hand someone a temporary password, so that's
    // the expected outcome either way).
    let userId;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr) {
      const alreadyExists = /already.*registered|already.*exists/i.test(createErr.message || '');
      if (!alreadyExists) return res.status(400).json({ error: createErr.message });

      // supabase-js has no getUserByEmail -- page through listUsers() to
      // find them. Fine at this business's scale; if it ever isn't, this is
      // the first place to revisit.
      let match = null;
      for (let page = 1; page <= 20 && !match; page++) {
        const { data: pageData, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (listErr) return res.status(400).json({ error: listErr.message });
        match = (pageData?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
        if (!pageData?.users?.length || pageData.users.length < 200) break; // last page
      }
      if (!match) return res.status(400).json({ error: 'A user with this email already exists, but could not be found to promote. Double-check the email address.' });

      const { error: pwErr } = await admin.auth.admin.updateUserById(match.id, { password });
      if (pwErr) return res.status(400).json({ error: 'Found the existing account but could not reset its password: ' + pwErr.message });
      userId = match.id;
    } else {
      userId = created.user.id;
    }

    const { error: profileErr } = await admin.from('profiles').upsert({
      id: userId,
      email,
      role,
      contact_name: full_name || email,
    });

    if (profileErr) {
      // Only safe to undo the auth user if we just created it -- an
      // existing account being promoted must NOT be deleted on a profile
      // write failure.
      if (created?.user) await admin.auth.admin.deleteUser(userId).catch(() => {});
      return res.status(400).json({ error: profileErr.message });
    }

    return res.status(200).json({ success: true, user_id: userId, email, role, promoted: !created?.user });
  } catch (err) {
    console.error('create-dev-user failed:', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
};
