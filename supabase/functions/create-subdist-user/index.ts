import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { email, password, name, sub_distributor_id } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const userId = authData.user.id;

    // Set role in profiles
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      email,
      role: "sub_distributor",
      full_name: name || email,
    });

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Link to sub_distributor record if provided
    if (sub_distributor_id) {
      await supabase.from("sub_distributors").update({ user_id: userId }).eq("id", sub_distributor_id);
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
