-- Fixes a real, live bug (not the RRS-25/is_admin() permissions bug --
-- a genuine check constraint blocking every status change for everyone,
-- Owner and Marketing alike): "Couldn't update lead: new row for
-- relation quote_requests violates check constraint
-- quote_requests_status_check".
--
-- 20260828_marketing_crm.sql's own comment claims "status already holds
-- free text with no check constraint (confirmed -- no such constraint
-- exists in the schema)" -- true when that migration was written, but a
-- check constraint named quote_requests_status_check exists live today,
-- most likely added directly via the SQL Editor at some point outside
-- any tracked migration (same class of drift as the meta_title/
-- cost_per_case incidents earlier). It only allows the OLDER, pre-CRM
-- quote workflow's status values (quote-request/quote submission code
-- in supabase/functions/quote-request and send-quote still write
-- 'pending' and 'quoted'), not the 5-stage CRM pipeline
-- (new/contacted/quote_sent/customer/repeat_customer) admin.js's CRM
-- board actually uses -- so moving a lead to "Customer" (or any other
-- CRM stage) fails outright.
--
-- Fix: widen the constraint to allow every vocabulary actually in use,
-- rather than picking one and breaking the others -- the Edge
-- Functions, the CRM board, AND the older quote-detail modal
-- (admin.js's saveQuoteStatus(), quoteStatusSelect in admin.html:
-- new/reviewed/quoted/closed -- a separate, still-reachable UI) all
-- keep writing exactly what they already write today. Constraint name
-- looked up from information_schema rather than hardcoded, in case it
-- wasn't actually named quote_requests_status_check (Postgres's
-- default naming) when it was added.

do $$
declare
  check_name text;
begin
  select tc.constraint_name into check_name
  from information_schema.table_constraints tc
  join information_schema.check_constraints cc using (constraint_schema, constraint_name)
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
    'pending', 'quoted',                                              -- pre-CRM quote workflow
    'new', 'contacted', 'quote_sent', 'customer', 'repeat_customer',   -- CRM pipeline
    'reviewed', 'closed'                                              -- older quote-detail modal (admin.html's quoteStatusSelect)
  ));
