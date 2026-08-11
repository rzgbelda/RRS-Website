/* ============================================================
   Room Ready Supply — Supabase Client
   Replace the two values below with your project credentials:
   Supabase Dashboard → Project Settings → API
   ============================================================ */

const SUPABASE_URL  = 'https://giprkvlyouwfzjlaibkq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_B17JFi1RywMYN_a-UN_qzw_sWH_5lDN';

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
