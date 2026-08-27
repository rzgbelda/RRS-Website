-- guard_profile_role_change (20260814_dev_tickets.sql) exists to stop a
-- signed-in customer from editing their OWN profile client-side to set
-- role='admin'. It checks is_admin()/auth.uid(), which only exist in an
-- end-user's own session -- so it was also (incorrectly) blocking
-- api/create-dev-user.js's service-role promotion of an existing user to
-- staff, discovered live when promoting sales@roomreadysupply.com to
-- marketing failed with "Only an administrator may change an account role."
--
-- That endpoint already verifies the caller is a real admin via their
-- access token before ever touching this table, so the service-role path
-- itself is safe to exempt -- the customer self-promotion hole this trigger
-- protects against is unaffected, since that always goes through a real
-- user JWT, never the service role.
create or replace function public.guard_profile_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if not public.is_admin() or new.id = auth.uid() then
      raise exception 'Only an administrator may change an account role.';
    end if;
  end if;
  return new;
end $$;
