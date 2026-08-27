// Staff account management for the admin panel: create/promote a staff
// account (developer/marketing/admin), and delete a user entirely.
//
// Dispatches on body.action rather than being two separate files -- Vercel's
// Hobby plan caps serverless functions at 12, and this project was already
// at 11 before the Marketing Account work started. Follows the same
// action-dispatch pattern already used in api/create-order.js.
//
// Every action here does something only an account-management role should
// be able to do, so every branch verifies the CALLER's role from the
// database using their access token -- never a role claim sent in the
// request body.

const { createClient } = require('@supabase/supabase-js');

// 'owner' = full, unrestricted access (was 'admin' before the CEO/Owner vs
// Admin role split). 'admin' = the narrower Users/Dev-Tickets/Hero/About
// account-management role. Both may manage staff accounts and users --
// that IS the Admin role's job; Owner can do it too since Owner can do
// everything.
const ACCOUNT_MANAGER_ROLES = ['owner', 'admin'];

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
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // --- Authorize the caller -------------------------------------------
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Not signed in.' });

    const { data: caller, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller?.user) return res.status(401).json({ error: 'Invalid session.' });

    const { data: callerProfile } = await admin
      .from('profiles').select('role').eq('id', caller.user.id).single();

    if (!ACCOUNT_MANAGER_ROLES.includes(callerProfile?.role)) {
      return res.status(403).json({ error: 'Only Owner or Admin accounts can manage staff/users.' });
    }

    // --- Delete a user entirely ------------------------------------------
    // profiles.id references auth.users(id) on delete cascade, so deleting
    // the auth user removes their profile row too -- the previous
    // client-side `profiles.delete()` only ever removed the profile row and
    // silently ignored errors, leaving the actual login (and the ability to
    // sign back in) completely intact. That was the real bug behind
    // "Remove did nothing."
    if (body.action === 'delete_user') {
      const { user_id } = body;
      if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
      if (user_id === caller.user.id) return res.status(400).json({ error: "You can't remove your own account." });

      const { error: delErr } = await admin.auth.admin.deleteUser(user_id);
      if (delErr) return res.status(400).json({ error: delErr.message });
      return res.status(200).json({ success: true });
    }

    // --- Create a staff account, OR promote an existing one --------------
    const { email, password, full_name } = body;
    const role = ['marketing', 'admin'].includes(body.role) ? body.role : 'developer'; // allow-list, not a passthrough -- 'owner' is deliberately never self-service

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

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
