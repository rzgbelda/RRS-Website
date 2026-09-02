-- Dev Ticket RRS-25: "Can not update lead in crm" -- staff can't move a
-- lead's CRM status to "Customer" (or make any other admin-gated write).
--
-- Root cause: profiles.role's full-access value was renamed from 'admin'
-- to 'owner' at some point (see admin.js's own comment: "'owner' (see
-- isTabAllowed below) -- 'admin' no longer means that"), but is_admin()
-- -- the function every admin-gated RLS policy in the schema calls,
-- including is_crm_staff() which gates quote_requests writes -- was never
-- updated to match. It still checks role = 'admin' literally. Any account
-- whose role is actually 'owner' silently fails every one of those writes:
-- RLS just returns 0 rows updated, which the client reports as "you don't
-- have permission" or, worse, a no-op that looks like nothing happened.
--
-- Fixed at the single source (is_admin() itself, security definer stable)
-- rather than patching each of the 55 policies that call it -- every
-- admin-gated RLS check across the schema is fixed by this one change.
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role in ('admin', 'owner') from public.profiles where id = auth.uid()),
    false
  )
$$;
