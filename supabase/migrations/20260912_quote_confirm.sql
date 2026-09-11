-- Lets a customer confirm a priced quote themselves via a link in the
-- quote email, instead of the only path forward being a reply/phone call.
-- Confirming creates a real order (visible in the admin Orders tab,
-- payment_status 'pending_invoice') but does NOT send a payment link --
-- that stays a deliberate staff action from the Orders tab (the existing
-- "Email Invoice & Pay Link" button, previewOrderInvoice()), matching the
-- explicit decision to keep a human checkpoint before any Stripe link
-- goes out.
--
-- Same token pattern as terms_token/terms_agreements: an unguessable
-- value in the emailed link is what authorizes the public confirm page,
-- since quote_requests holds customer PII and stays staff-only under RLS.

alter table public.quote_requests
  add column if not exists confirm_token text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_order_id uuid references public.orders(id) on delete set null;

create unique index if not exists quote_requests_confirm_token_idx
  on public.quote_requests (confirm_token)
  where confirm_token is not null;

-- 'accepted' is the new status a confirmed quote moves to -- distinct
-- from 'quoted' (priced and sent, awaiting the customer) so the admin
-- quote list can tell the two apart at a glance. Existing constraint
-- (20260903_fix_quote_requests_status_check.sql) needs to be re-created
-- rather than just adding a value, same as that migration itself did.
do $$
declare
  check_name text;
begin
  select tc.constraint_name into check_name
  from information_schema.table_constraints tc
  join information_schema.check_constraints cc
    on tc.constraint_name = cc.constraint_name
  where tc.table_schema = 'public'
    and tc.table_name = 'quote_requests'
    and tc.constraint_type = 'CHECK'
    and cc.check_clause like '%status%'
  limit 1;
  if check_name is not null then
    execute format('alter table public.quote_requests drop constraint %I', check_name);
  end if;
end $$;

alter table public.quote_requests
  add constraint quote_requests_status_check
  check (status in (
    'pending', 'quoted', 'accepted',                                  -- pre-CRM quote workflow (+ new)
    'new', 'contacted', 'quote_sent', 'customer', 'repeat_customer',   -- CRM pipeline
    'reviewed', 'closed'                                              -- older quote-detail modal
  ));
