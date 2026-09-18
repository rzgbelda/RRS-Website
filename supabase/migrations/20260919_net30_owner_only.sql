-- Restricts who can grant Net 30 terms to owner only (the CEO's account),
-- and removes the unrestricted self-service Net-30 path from checkout.
--
-- Two separate problems, found while working through the CEO's review:
--
-- 1. net_30_terms on quote_requests (20260814c) is a plain checkbox in
--    the admin quote composer with no role check at all -- any staff
--    account (marketing included, via marketing_update_quote_requests)
--    could grant Net 30 on a quote. The CEO's instruction is that only he
--    grants it.
--
-- 2. Separately and more seriously: payment.html's "Invoice Me" and
--    "Purchase Order" options let ANY customer -- no login, no approval,
--    nobody looking at it first -- place a real order on Net 30 terms
--    (payment_status: 'pending_invoice') straight through api/create-
--    order.js. There is no such thing as an "approved account" flag
--    anywhere in the system; those options' "approved accounts only"
--    copy (added in the CEO-review pass just before this one) was a
--    label, not a lock. That self-service path is being removed
--    entirely -- Net 30 is now only ever set by an owner working an
--    order/quote directly in admin.
--
-- This migration only does #1 (the database-side lock on net_30_terms).
-- #2 is a front-end change to payment.html and does not touch the
-- database at all -- customers stop being offered the options, and the
-- fields that already exist (fulfillment_method='po' etc.) are simply no
-- longer reachable from the public site.
--
-- Mirrors 20260912b_quote_credit_owner_only.sql exactly: is_owner()
-- already exists from that migration, so this only adds the trigger.

-- Same reasoning as the credit trigger: RLS can't restrict a single
-- column (marketing_update_quote_requests grants UPDATE on the whole
-- row), so this is a BEFORE UPDATE trigger that inspects just the one
-- column being protected.
create or replace function public.enforce_net30_owner_only()
returns trigger language plpgsql security definer as $$
begin
  if new.net_30_terms is distinct from old.net_30_terms then
    if not public.is_owner() then
      raise exception 'Only an owner account may grant Net 30 terms'
        using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_net30_owner_only on public.quote_requests;
create trigger trg_net30_owner_only
  before update on public.quote_requests
  for each row execute function public.enforce_net30_owner_only();

-- Same restriction on INSERT: a new quote must not be created with
-- net_30_terms already true unless an owner is doing the creating.
-- (Nothing sets net_30_terms on insert today -- it is only ever set
-- later from the admin composer's checkbox, which is a plain UPDATE and
-- already covered by the trigger above. This is a second trigger purely
-- so a future insert path cannot slip net_30_terms=true past the check
-- the UPDATE trigger enforces.)
create or replace function public.enforce_net30_owner_only_insert()
returns trigger language plpgsql security definer as $$
begin
  if new.net_30_terms and not public.is_owner() then
    raise exception 'Only an owner account may grant Net 30 terms'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists trg_net30_owner_only_insert on public.quote_requests;
create trigger trg_net30_owner_only_insert
  before insert on public.quote_requests
  for each row execute function public.enforce_net30_owner_only_insert();

-- Verify:
--   -- as marketing, this must fail with "Only an owner account may grant Net 30 terms":
--   update public.quote_requests set net_30_terms = true where id = '<some-id>';
--   -- as owner, the same statement must succeed.
