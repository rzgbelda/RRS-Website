/* ============================================================
   Room Ready Supply — Supabase Client
   Replace the two values below with your project credentials:
   Supabase Dashboard → Project Settings → API
   ============================================================ */

const SUPABASE_URL  = 'https://giprkvlyouwfzjlaibkq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_B17JFi1RywMYN_a-UN_qzw_sWH_5lDN';

/* Password-reset links that land on the wrong page.
   When an email's redirectTo isn't on Supabase's allowed Redirect URLs list
   (e.g. "/reset-password?from=admin", or the non-www domain), Supabase sends
   the person to the Site URL -- the homepage -- with the recovery token still
   in the URL, and nothing there uses it. Forward them to the reset page with
   the token intact. Must run before createClient(): the client reads the
   token out of the URL and clears it, and the session alone doesn't say it
   came from a reset link. Expired links go too, so the reset page can say so. */
(function forwardPasswordRecoveryLink() {
  if (/\/reset-password(\.html)?$/.test(location.pathname)) return;
  const url = location.search + location.hash;
  if (/[?#&]type=recovery\b/.test(url) || /error_code=otp_expired/.test(url)) {
    location.replace('/reset-password' + location.search + location.hash);
  }
})();

/* Initialise once, expose as window.sb everywhere */
const { createClient } = window.supabase;
window.sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession : true,
    autoRefreshToken: true,
  }
});

/* Convenience: current session user */
window.getUser = async () => {
  const { data: { user } } = await window.sb.auth.getUser();
  return user;
};

/* Convenience: current user's profile (includes role) */
window.getProfile = async () => {
  const user = await window.getUser();
  if (!user) return null;
  const { data } = await window.sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  return data;
};
