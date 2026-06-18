/* ============================================================
   Room Ready Supply — Supabase Client
   Replace the two values below with your project credentials:
   Supabase Dashboard → Project Settings → API
   ============================================================ */

const SUPABASE_URL  = 'https://giprkvlyouwfzjlaibkq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpcHJrdmx5b3V3ZnpqbGFpYmtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjA0ODUsImV4cCI6MjA5NjczNjQ4NX0.y0K_i9oN9DUNx_xIxUDWbvyXsubYIKpJR5un1yLtvvY';

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
