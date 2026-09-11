import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Staff-role guard for Edge Functions that hold the service role key.
 *
 * Why platform verify_jwt is not enough: it only proves the caller
 * presented a valid key for this project -- and the publishable anon key
 * is embedded in the source of every page on the public site. So any
 * visitor can satisfy verify_jwt. Functions that create users, spend money
 * on shipping labels, or email customers need to know the caller is a real
 * signed-in staff member, which is what this checks.
 *
 * Usage:
 *   const staff = await requireStaff(req);
 *   if (!staff.ok) return staff.response;
 */
export async function requireStaff(
  req: Request,
  cors: Record<string, string>,
  roles: string[] = ["owner", "admin", "marketing"],
): Promise<
  | { ok: true; userId: string; role: string }
  | { ok: false; response: Response }
> {
  const deny = (status: number, error: string) => ({
    ok: false as const,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    }),
  });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return deny(401, "Authentication required");

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: caller, error } = await sb.auth.getUser(token);
  if (error || !caller?.user) return deny(401, "Authentication required");

  // Role comes from the profiles table, not the token's user_metadata --
  // a user can edit their own metadata, but not this.
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", caller.user.id)
    .single();

  if (!profile || !roles.includes(profile.role)) {
    return deny(403, "Insufficient permissions");
  }

  return { ok: true, userId: caller.user.id, role: profile.role };
}
