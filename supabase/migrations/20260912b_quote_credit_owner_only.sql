-- Adds an owner-issued credit to a quote: a flat dollar amount deducted
-- from the invoice total, applied AFTER tax so the tax figure the customer
-- already saw on their quote does not change.
--
-- Only the owner role may set it. That is enforced here in the database,
-- not just by greying the field out in admin.js -- a client-side check
-- stops an honest mistake but not someone with dev tools, and this field
-- moves money.
--
-- Two things had to be corrected to make owner-only possible at all:
--
-- 1. is_admin() returns true for BOTH 'admin' and 'owner' (see
--    20260902e), so it cannot express "owner only". This adds a separate
--    is_owner() rather than narrowing is_admin(), which ~55 policies call
--    and which must keep meaning what it means today.
--
-- 2. quote_requests' write policies from 20260902f grant UPDATE to
--    is_marketing() ONLY -- owner has no UPDATE at all today, so the
--    Save Status / shipping-address / credit writes in the quote modal
--    silently no-op for an owner account (RLS reports 0 rows, which the
--    UI shows as "nothing happened"). That migration intentionally made
--    CRM read-only for owner, and that intent is preserved for the CRM
--    tables; but quote_requests is also the quoting/invoicing surface,
--    not purely a CRM lead list, so owner needs UPDATE on it.

create or replace function public.is_owner()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role = 'owner' from public.profiles where id = auth.uid()),
    false
  )
$$;

alter table public.quote_requests
  add column if not exists credit_amount numeric(10,2) not null default 0,
  add column if not exists credit_note text,
  add column if not exists credit_issued_by uuid references auth.users(id) on delete set null,
  add column if not exists credit_issued_at timestamptz;

-- A credit reduces what is owed; it can never be negative, and a negative
-- value would silently INCREASE an invoice total.
alter table public.quote_requests
  drop constraint if exists quote_requests_credit_amount_nonneg;
alter table public.quote_requests
  add constraint quote_requests_credit_amount_nonneg check (credit_amount >= 0);

-- Restore UPDATE for owner on this table (see note 2 above). Marketing
-- keeps the UPDATE it already had.
drop policy if exists "owner_update_quote_requests" on public.quote_requests;
create policy "owner_update_quote_requests" on public.quote_requests
  for update using (public.is_owner()) with check (public.is_owner());

-- Marketing (and anyone else who can update this table) must not be able
-- to change the credit columns. Postgres has no column-level RLS, so this
-- is a trigger: any UPDATE that changes a credit field must come from an
-- owner, and it stamps who/when rather than trusting the client to.
create or replace function public.enforce_quote_credit_owner_only()
returns trigger language plpgsql security definer as $$
begin
  if new.credit_amount is distinct from old.credit_amount
     or new.credit_note is distinct from old.credit_note then

    if not public.is_owner() then
      raise exception 'Only an owner account may set a quote credit'
        using errcode = '42501';
    end if;

    -- Provenance is recorded server-side so it cannot be spoofed by the
    -- caller, and is cleared when a credit is removed entirely.
    if new.credit_amount > 0 then
      new.credit_issued_by := auth.uid();
      new.credit_issued_at := now();
    else
      new.credit_issued_by := null;
      new.credit_issued_at := null;
    end if;

  else
    -- Not a credit change: never let these fields drift via any other
    -- update path (a full-row upsert from the composer, for instance).
    new.credit_amount    := old.credit_amount;
    new.credit_note      := old.credit_note;
    new.credit_issued_by := old.credit_issued_by;
    new.credit_issued_at := old.credit_issued_at;
  end if;

  return new;
end
$$;

drop trigger if exists trg_quote_credit_owner_only on public.quote_requests;
create trigger trg_quote_credit_owner_only
  before update on public.quote_requests
  for each row execute function public.enforce_quote_credit_owner_only();

-- Verify:
--   select credit_amount, credit_note, credit_issued_at from public.quote_requests limit 5;
--   -- as marketing, this must fail with "Only an owner account may set a quote credit":
--   -- update public.quote_requests set credit_amount = 50 where id = '<some-id>';
