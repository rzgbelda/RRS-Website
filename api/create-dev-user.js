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
const { Resend } = require('resend');
const rateLimit = require('./_lib/rate-limit');

// Sales rep accounts (action: 'create_sales_user') are dispatched from here
// too, same 12-function-cap reasoning as the header comment above -- and
// unlike every other account type this file creates, the CEO asked for
// sales accounts to get their credentials emailed automatically rather
// than relayed by hand, so this is the one flow here that sends mail.
const TIER_LABELS = { tier1: 'Tier 1 (8% commission)', tier2: 'Tier 2 (5% commission)' };

let _resend = null;
function getResend() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  _resend = new Resend(key);
  return _resend;
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendSalesCredentialsEmail({ email, full_name, password, tier }) {
  const resend = getResend();
  const loginUrl = 'https://www.roomreadysupply.com/login';
  const html = `
    <div style="font-family:sans-serif;color:#0B1F38;max-width:520px;margin:0 auto;">
      <h2 style="color:#0B1F38;">Welcome to the Room Ready Supply Sales Team</h2>
      <p>Hi ${escHtml(full_name || email)},</p>
      <p>An account has been created for you on the RRS Sales Portal as a <strong>${escHtml(TIER_LABELS[tier] || tier)}</strong> closer.</p>
      <table style="border-collapse:collapse;margin:18px 0;">
        <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Login URL</td><td><a href="${loginUrl}">${loginUrl}</a></td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Email</td><td>${escHtml(email)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Temporary Password</td><td><strong>${escHtml(password)}</strong></td></tr>
      </table>
      <p>For security, please sign in and change your password right away from the Account tab.</p>
      <p style="font-size:12px;color:#94a3b8;margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;">Room Ready Supply &bull; 609 Washington St, Plymouth, NC 27962</p>
    </div>`;

  await resend.emails.send({
    from: 'Room Ready Supply <marketing@roomreadysupply.com>',
    reply_to: 'sales@roomreadysupply.com',
    to: email,
    subject: 'Your Room Ready Supply Sales Portal login',
    html,
  });
}

// Staff logins get their credentials by email too, same as sales reps --
// staff were left waiting on someone to relay a temporary password by hand.
const STAFF_ROLE_LABELS = {
  developer: 'Web Developer', marketing: 'Marketing', operations: 'Head of Operations',
  supply_chain: 'Supply Chain Manager', admin: 'Admin',
};

async function sendStaffCredentialsEmail({ email, full_name, password, role }) {
  const resend = getResend();
  const loginUrl = 'https://www.roomreadysupply.com/admin';
  const html = `
    <div style="font-family:sans-serif;color:#0B1F38;max-width:520px;margin:0 auto;">
      <h2 style="color:#0B1F38;">Your Room Ready Supply staff account</h2>
      <p>Hi ${escHtml(full_name || email)},</p>
      <p>An account has been set up for you as <strong>${escHtml(STAFF_ROLE_LABELS[role] || role)}</strong>. Sign in to see your tasks on the Work Board.</p>
      <table style="border-collapse:collapse;margin:18px 0;">
        <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Login URL</td><td><a href="${loginUrl}">${loginUrl}</a></td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Email</td><td>${escHtml(email)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Temporary Password</td><td><strong>${escHtml(password)}</strong></td></tr>
      </table>
      <p>For security, please sign in and change your password right away: click your name at the top right, then <strong>Change Password</strong>.</p>
      <p style="font-size:12px;color:#94a3b8;margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;">Room Ready Supply &bull; 609 Washington St, Plymouth, NC 27962</p>
    </div>`;

  await resend.emails.send({
    from: 'Room Ready Supply <marketing@roomreadysupply.com>',
    to: email,
    subject: 'Your Room Ready Supply staff login',
    html,
  });
}

// 'owner' = full, unrestricted access (was 'admin' before the CEO/Owner vs
// Admin role split). 'admin' = the narrower Users/Dev-Tickets/Hero/About
// account-management role. Both may remove users and manage sales rep
// logins (Users and Sales Team tabs).
const ACCOUNT_MANAGER_ROLES = ['owner', 'admin'];

// Creating or granting a staff account (developer, marketing, operations,
// supply chain, admin) is Owner and Developer only -- the developer is also
// the company's IT. 'owner' itself is still never handed out here.
const STAFF_ACCOUNT_ROLES = ['owner', 'developer'];

// Moving an existing staff member to another department = changing their
// role (department follows role on the Work Board, and so does their admin
// access). Owner, Head of Operations and Developer may do this. Only these
// department roles move; Owner, Admin and the sales roles (managed from
// the Sales Team tab, with a sales code) never change here.
const STAFF_MOVER_ROLES = ['owner', 'operations', 'developer'];
const DEPARTMENT_ROLES = ['developer', 'marketing', 'supply_chain', 'operations'];

// Deactivating a staff login (they leave the company, or the account is no
// longer needed): Owner and Developer only. It bans the login so they can't
// sign in, but keeps the account row and every ticket / comment / report
// entry they ever made. Reversible. Same account types as creation.
const STAFF_DEACTIVATE_ROLES = ['owner', 'developer'];
const DEACTIVATABLE_ROLES = ['developer', 'marketing', 'supply_chain', 'operations', 'admin', 'sales', 'sales_manager'];
const BAN_FOREVER = '876000h'; // ~100 years; 'none' lifts it

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

    const callerRole = callerProfile?.role;
    const isSalesCreate = body.action === 'create_sales_user';
    const isUserAction = body.action === 'delete_user' || isSalesCreate;
    const isMove = body.action === 'change_staff_role';
    const isActive = body.action === 'set_staff_active';
    // Sales Closer logins can also be made from Staff Accounts, which the
    // Developer (company IT) runs -- so Developer may create them too.
    // Deleting users stays Owner/Admin only.
    if (isSalesCreate && ![...ACCOUNT_MANAGER_ROLES, 'developer'].includes(callerRole)) {
      return res.status(403).json({ error: 'Only Owner, Admin or Developer accounts can create sales logins.' });
    }
    if (isUserAction && !isSalesCreate && !ACCOUNT_MANAGER_ROLES.includes(callerRole)) {
      return res.status(403).json({ error: 'Only Owner or Admin accounts can manage users.' });
    }
    if (isMove && !STAFF_MOVER_ROLES.includes(callerRole)) {
      return res.status(403).json({ error: 'Only Owner, Head of Operations or Developer accounts can move staff.' });
    }
    if (isActive && !STAFF_DEACTIVATE_ROLES.includes(callerRole)) {
      return res.status(403).json({ error: 'Only Owner or Developer accounts can deactivate staff.' });
    }
    if (!isUserAction && !isMove && !isActive && !STAFF_ACCOUNT_ROLES.includes(callerRole)) {
      return res.status(403).json({ error: 'Only Owner or Developer accounts can create staff accounts.' });
    }

    // Creates and deletes real auth users. Throttled even though it is
    // limited to account managers, so a stolen session cannot mass-create or
    // mass-delete accounts in a loop.
    if (!rateLimit(req, res, { bucket: 'staffmgmt', limit: 20, windowMs: 60000 })) return;

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

    // --- Deactivate / reactivate a staff login ---------------------------
    if (isActive) {
      const { user_id, active } = body;
      if (!user_id || typeof active !== 'boolean') return res.status(400).json({ error: 'user_id and active (true/false) are required.' });
      if (user_id === caller.user.id) return res.status(400).json({ error: "You can't deactivate your own account." });

      const { data: target } = await admin.from('profiles').select('id, role').eq('id', user_id).single();
      if (!target) return res.status(404).json({ error: 'Staff member not found.' });
      if (!DEACTIVATABLE_ROLES.includes(target.role)) {
        return res.status(400).json({ error: 'Only staff accounts can be deactivated here (not the Owner, customers or affiliates).' });
      }

      // Ban first: if the profile write then fails the login is still
      // blocked, which is the safe direction.
      const { error: banErr } = await admin.auth.admin.updateUserById(user_id, { ban_duration: active ? 'none' : BAN_FOREVER });
      if (banErr) return res.status(400).json({ error: banErr.message });

      const { error: upErr } = await admin.from('profiles')
        .update({ deactivated_at: active ? null : new Date().toISOString() }).eq('id', user_id);
      if (upErr) return res.status(400).json({ error: 'Login ' + (active ? 'restored' : 'blocked') + ', but the account note failed to save: ' + upErr.message });

      // A sales rep's record goes inactive too, so their code stops
      // resolving at checkout (lookup_sales_code only matches 'active').
      if (target.role === 'sales' || target.role === 'sales_manager') {
        await admin.from('sales_reps').update({ status: active ? 'active' : 'inactive' }).eq('user_id', user_id);
      }

      // Their unfinished tasks go back to "needs an owner" so nothing sits
      // with someone who can no longer act on it. Finished work keeps
      // their name for the daily report.
      let released = 0;
      if (!active) {
        const { data: freed } = await admin.from('dev_tickets')
          .update({ assignee_id: null, assignee_email: null })
          .eq('assignee_id', user_id).in('status', ['open', 'in_progress']).select('id');
        released = (freed || []).length;
      }
      return res.status(200).json({ success: true, active, released });
    }

    // --- Move a staff member to another department ----------------------
    if (isMove) {
      const { user_id, role: newRole } = body;
      if (!user_id || !DEPARTMENT_ROLES.includes(newRole)) {
        return res.status(400).json({ error: 'Pick a staff member and one of: Web Dev, Marketing, Supply Chain, Operations.' });
      }
      if (user_id === caller.user.id) return res.status(400).json({ error: "You can't move your own account." });

      const { data: target } = await admin.from('profiles').select('id, role').eq('id', user_id).single();
      if (!target) return res.status(404).json({ error: 'Staff member not found.' });
      if (!DEPARTMENT_ROLES.includes(target.role)) {
        return res.status(400).json({ error: 'Only Web Dev, Marketing, Supply Chain and Operations staff can be moved here.' });
      }
      if (target.role === newRole) return res.status(200).json({ success: true, role: newRole, unchanged: true });

      const { error: upErr } = await admin.from('profiles').update({ role: newRole }).eq('id', user_id);
      if (upErr) return res.status(400).json({ error: upErr.message });
      return res.status(200).json({ success: true, role: newRole, previous_role: target.role });
    }

    // --- Create/promote a sales rep account, emailing credentials --------
    if (body.action === 'create_sales_user') {
      const { email, password, full_name, phone, sales_code, tier, sales_rep_id, role: requestedRole } = body;
      const resolvedTier = ['tier1', 'tier2'].includes(tier) ? tier : 'tier1';
      const resolvedRole = requestedRole === 'sales_manager' ? 'sales_manager' : 'sales';

      if (!email || !password || !full_name || !sales_code) {
        return res.status(400).json({ error: 'Name, email, sales code, and password are required.' });
      }
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }

      let userId;
      let createdNewAuthUser = false;
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createErr) {
        const alreadyExists = /already.*registered|already.*exists/i.test(createErr.message || '');
        if (!alreadyExists) return res.status(400).json({ error: createErr.message });

        let match = null;
        for (let page = 1; page <= 20 && !match; page++) {
          const { data: pageData, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (listErr) return res.status(400).json({ error: listErr.message });
          match = (pageData?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
          if (!pageData?.users?.length || pageData.users.length < 200) break;
        }
        if (!match) return res.status(400).json({ error: 'A user with this email already exists, but could not be found to promote. Double-check the email address.' });

        const { error: pwErr } = await admin.auth.admin.updateUserById(match.id, { password });
        if (pwErr) return res.status(400).json({ error: 'Found the existing account but could not reset its password: ' + pwErr.message });
        userId = match.id;
      } else {
        userId = created.user.id;
        createdNewAuthUser = true;
      }

      const { error: profileErr } = await admin.from('profiles').upsert({
        id: userId,
        email,
        role: resolvedRole,
        contact_name: full_name,
      });

      if (profileErr) {
        if (createdNewAuthUser) await admin.auth.admin.deleteUser(userId).catch(() => {});
        return res.status(400).json({ error: profileErr.message });
      }

      const repRow = {
        user_id: userId,
        full_name,
        email,
        phone: phone || null,
        sales_code,
        tier: resolvedTier,
        status: 'active',
      };
      let repErr;
      if (sales_rep_id) {
        ({ error: repErr } = await admin.from('sales_reps').update(repRow).eq('id', sales_rep_id));
      } else {
        ({ error: repErr } = await admin.from('sales_reps').insert(repRow));
      }

      if (repErr) {
        if (createdNewAuthUser) await admin.auth.admin.deleteUser(userId).catch(() => {});
        return res.status(400).json({ error: repErr.message });
      }

      let emailWarning = null;
      try {
        await sendSalesCredentialsEmail({ email, full_name, password, tier: resolvedTier });
      } catch (e) {
        console.error('create-dev-user (sales): credentials email failed:', e.message);
        emailWarning = 'Account created, but the credentials email failed to send: ' + e.message;
      }

      return res.status(200).json({ success: true, user_id: userId, email, promoted: !createdNewAuthUser, warning: emailWarning });
    }

    // --- Create a staff account, OR promote an existing one --------------
    const { email, password, full_name } = body;
    const role = ['marketing', 'admin', 'operations', 'supply_chain'].includes(body.role) ? body.role : 'developer'; // allow-list, not a passthrough -- 'owner' is deliberately never self-service

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

    // full_name is the display name the admin and Work Board show;
    // contact_name alone left the list showing email addresses.
    const { error: profileErr } = await admin.from('profiles').upsert({
      id: userId,
      email,
      role,
      contact_name: full_name || email,
      ...(full_name ? { full_name } : {}),
    });

    if (profileErr) {
      // Only safe to undo the auth user if we just created it -- an
      // existing account being promoted must NOT be deleted on a profile
      // write failure.
      if (created?.user) await admin.auth.admin.deleteUser(userId).catch(() => {});
      return res.status(400).json({ error: profileErr.message });
    }

    let emailWarning = null;
    try {
      await sendStaffCredentialsEmail({ email, full_name, password, role });
    } catch (e) {
      console.error('create-dev-user (staff): credentials email failed:', e.message);
      emailWarning = 'Account created, but the login email failed to send: ' + e.message + '. Share the password with them directly.';
    }

    return res.status(200).json({ success: true, user_id: userId, email, role, promoted: !created?.user, warning: emailWarning });
  } catch (err) {
    console.error('create-dev-user failed:', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
};
