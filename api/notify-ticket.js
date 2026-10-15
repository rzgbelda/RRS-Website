// Emails the "ping" for a Work Board ticket: assignment, status change, a
// new comment, or a new unassigned ticket landing in a department. Called
// fire-and-forget from the admin Work Board, so this
// must always answer 200 quickly -- a mail failure should never make the
// board look broken. Failures are logged and reported in the body instead.
//
// The caller's claims are not trusted for *who* gets mailed: the recipient is
// re-read from the database using the service-role key, so a forged request
// can't be used to send mail to an arbitrary address.

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const requireStaff = require('./_lib/require-staff');
const rateLimit = require('./_lib/rate-limit');

let _resend = null;
function getResend() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  _resend = new Resend(key);
  return _resend;
}

const PRIORITY_STYLE = {
  critical: { label: 'Critical', bg: '#fee2e2', fg: '#b91c1c' },
  high:     { label: 'High',     bg: '#ffedd5', fg: '#c2410c' },
  medium:   { label: 'Medium',   bg: '#fef9c3', fg: '#a16207' },
  low:      { label: 'Low',      bg: '#e2e8f0', fg: '#475569' },
};
const DEPARTMENT_LABEL = {
  web_dev: 'Web Dev', marketing: 'Marketing', supply_chain: 'Supply Chain', operations: 'Operations',
};
// Who gets a new, unassigned ticket for each department: that team, plus
// the Head of Operations, who hands work out.
const DEPARTMENT_ROLE = {
  web_dev: 'developer', marketing: 'marketing', supply_chain: 'supply_chain', operations: 'operations',
};
const TEAM_ROLES = ['owner', 'admin', 'developer', 'marketing', 'operations', 'supply_chain'];
const STATUS_LABEL = {
  open: 'Open', in_progress: 'In Progress', done: 'Done', not_possible: 'Not Possible',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ticketEmailHtml(ticket, event, message, actorEmail) {
  const pr = PRIORITY_STYLE[ticket.priority] || PRIORITY_STYLE.medium;
  const heading = {
    assigned: 'A ticket was assigned to you',
    comment:  'New comment on a ticket you follow',
    status:   'Ticket status changed',
    created:  'New ticket for ' + (DEPARTMENT_LABEL[ticket.department] || 'your team'),
  }[event] || 'Ticket updated';

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">' +
    '<div style="max-width:560px;margin:0 auto;padding:32px 20px;">' +

    '<div style="background:#0B1F38;border-radius:14px 14px 0 0;padding:24px 28px;">' +
      '<p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#ED7226;">Room Ready Supply &middot; Work Board</p>' +
      '<h1 style="margin:0;font-size:19px;font-weight:800;color:#fff;line-height:1.3;">' + esc(heading) + '</h1>' +
    '</div>' +

    '<div style="background:#fff;border-radius:0 0 14px 14px;padding:26px 28px;">' +

      '<div style="display:inline-block;margin:0 0 14px;">' +
        '<span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:700;color:#94a3b8;">' + esc(ticket.ticket_number || '') + '</span>' +
        '<span style="display:inline-block;margin-left:8px;background:' + pr.bg + ';color:' + pr.fg + ';font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:6px;">' + pr.label + '</span>' +
      '</div>' +

      '<h2 style="margin:0 0 16px;font-size:17px;font-weight:750;color:#0B1F38;line-height:1.4;">' + esc(ticket.title) + '</h2>' +

      (message
        ? '<div style="background:#f8fafc;border-left:3px solid #ED7226;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 18px;">' +
            (actorEmail ? '<p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#94a3b8;">' + esc(actorEmail) + '</p>' : '') +
            '<p style="margin:0;font-size:14px;color:#334155;line-height:1.6;white-space:pre-wrap;">' + esc(message) + '</p>' +
          '</div>'
        : '') +

      '<table style="width:100%;border-collapse:collapse;margin:0 0 22px;">' +
        '<tr><td style="padding:7px 0;font-size:12px;color:#94a3b8;">Team</td>' +
            '<td style="padding:7px 0;font-size:13px;font-weight:700;color:#334155;text-align:right;">' + esc(DEPARTMENT_LABEL[ticket.department] || '—') + '</td></tr>' +
        (ticket.due_date
          ? '<tr><td style="padding:7px 0;font-size:12px;color:#94a3b8;">Due</td>' +
            '<td style="padding:7px 0;font-size:13px;font-weight:700;color:#334155;text-align:right;">' + esc(ticket.due_date) + '</td></tr>'
          : '') +
        '<tr><td style="padding:7px 0;font-size:12px;color:#94a3b8;">Status</td>' +
            '<td style="padding:7px 0;font-size:13px;font-weight:700;color:#334155;text-align:right;">' + esc(STATUS_LABEL[ticket.status] || ticket.status) + '</td></tr>' +
        '<tr><td style="padding:7px 0;font-size:12px;color:#94a3b8;">Reported by</td>' +
            '<td style="padding:7px 0;font-size:13px;font-weight:700;color:#334155;text-align:right;">' + esc(ticket.reporter_email || '—') + '</td></tr>' +
      '</table>' +

      '<a href="https://www.roomreadysupply.com/admin#ticket=' + encodeURIComponent(ticket.ticket_number || '') + '" style="display:block;background:#ED7226;color:#fff;text-decoration:none;text-align:center;padding:12px 24px;border-radius:8px;font-weight:800;font-size:14px;">Open the ticket &rarr;</a>' +

    '</div></div></body></html>';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Staff only. The recipient is already re-read from the database rather
  // than taken from the body, so this can't be aimed at an arbitrary
  // address -- but unauthenticated it still lets anyone trigger mail to
  // staff at will, so it gets the same gate as the other service-role
  // endpoints.
  const staff = await requireStaff(req, res, { roles: TEAM_ROLES });
  if (!staff) return;

  // Authenticated, but a throttle still matters: this sends mail /
  // writes with the service role, so one compromised or careless
  // staff session should not be able to burn the whole quota.
  if (!rateLimit(req, res, { bucket: 'ticket', limit: 30, windowMs: 60000 })) return;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { ticket, event, message } = body;
    // The actor comes from the verified session, not the body.
    const actor_email = staff.user.email || null;

    if (!ticket || !ticket.id) return res.status(400).json({ error: 'ticket.id required' });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return res.status(200).json({ sent: false, reason: 'supabase-not-configured' });

    // Re-read the ticket server-side: the recipient must come from the
    // database, never from the request body.
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data: row, error } = await supabase
      .from('dev_tickets')
      .select('id,ticket_number,title,priority,status,department,due_date,assignee_email,reporter_email')
      .eq('id', ticket.id)
      .single();

    if (error || !row) return res.status(200).json({ sent: false, reason: 'ticket-not-found' });

    // Who hears about it:
    //   assigned          -> the assignee
    //   status / comment  -> the assignee and whoever filed it
    //   created           -> the department's team and the Head of Operations
    //                        (only sent when nobody is assigned yet)
    let recipients = [];
    if (event === 'assigned') {
      recipients = [row.assignee_email];
    } else if (event === 'created') {
      if (!row.assignee_email) {
        const roles = ['operations', DEPARTMENT_ROLE[row.department]].filter(Boolean);
        const { data: team } = await supabase.from('profiles').select('email').in('role', roles);
        recipients = (team || []).map(p => p.email);
      }
    } else {
      recipients = [row.assignee_email, row.reporter_email];
    }

    const actor = String(actor_email || '').toLowerCase();
    const to = [...new Set(recipients.filter(Boolean).map(e => e.toLowerCase()))].filter(e => e !== actor);
    if (!to.length) return res.status(200).json({ sent: false, reason: 'no-recipients' });

    const subject = '[' + (row.ticket_number || 'Ticket') + '] ' +
      ({ assigned: 'Assigned to you', comment: 'New comment', status: 'Status updated', created: 'New ticket for ' + (DEPARTMENT_LABEL[row.department] || 'your team') }[event] || 'Updated') +
      ' — ' + row.title;

    await getResend().emails.send({
      from: 'Room Ready Supply Tickets <orders@roomreadysupply.com>',
      to,
      subject,
      html: ticketEmailHtml(row, event, message, actor_email),
    });

    return res.status(200).json({ sent: true, to });
  } catch (err) {
    console.error('notify-ticket failed:', err);
    // 200 on purpose: the board already saved the change, and a mail
    // failure is not a reason to surface an error to the person using it.
    return res.status(200).json({ sent: false, reason: String(err.message || err) });
  }
};
