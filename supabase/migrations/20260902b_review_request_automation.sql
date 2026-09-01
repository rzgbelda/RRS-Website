-- SEO Roadmap Day 16: post-delivery review-request email flow.
-- Reuses the trigger -> delay -> email automation engine built for
-- Priority-3/marketing-gap-fill work (20260901f) rather than a second,
-- parallel system -- a third trigger type, 'order_delivered', alongside
-- the existing 'crm_lead_created' and 'quote_stale'. Fires once per order
-- staff mark 'delivered' (the real status orders.status already supports,
-- confirmed live in admin.js's status dropdown), after a configurable
-- delay so the ask doesn't land the same day a case of towels shows up.
--
-- automation_sends.target_type only supported 'quote_request' before this
-- -- widened to also accept 'order'. target_id's FK previously pointed
-- only at quote_requests; a single column can't carry two different
-- foreign keys, so the FK is dropped here and target existence is instead
-- checked in application code (the automation sweep already looks the
-- row up before sending, so a dangling target_id fails closed rather than
-- silently sending to nothing).
--
-- Constraint names are looked up from information_schema rather than
-- hardcoded, since inline `references`/`check` clauses get Postgres's
-- auto-generated default names, which are safe to assume but not
-- guaranteed if this table's history ever diverged from that default.

do $$
declare
  fk_name text;
  check_name text;
begin
  select tc.constraint_name into fk_name
  from information_schema.table_constraints tc
  where tc.table_schema = 'public'
    and tc.table_name = 'automation_sends'
    and tc.constraint_type = 'FOREIGN KEY'
    and tc.constraint_name in (
      select ccu.constraint_name
      from information_schema.constraint_column_usage ccu
      where ccu.table_name = 'automation_sends' and ccu.column_name = 'target_id'
    )
  limit 1;
  if fk_name is not null then
    execute format('alter table public.automation_sends drop constraint %I', fk_name);
  end if;

  select tc.constraint_name into check_name
  from information_schema.table_constraints tc
  join information_schema.check_constraints cc using (constraint_schema, constraint_name)
  where tc.table_schema = 'public'
    and tc.table_name = 'automation_sends'
    and tc.constraint_type = 'CHECK'
    and cc.check_clause like '%target_type%'
  limit 1;
  if check_name is not null then
    execute format('alter table public.automation_sends drop constraint %I', check_name);
  end if;
end $$;

alter table public.automation_sends
  add constraint automation_sends_target_type_check
  check (target_type in ('quote_request','order'));

alter table public.automation_sends
  alter column target_type drop default;

-- Same information_schema lookup for automations.trigger_type's check.
do $$
declare
  check_name text;
begin
  select tc.constraint_name into check_name
  from information_schema.table_constraints tc
  join information_schema.check_constraints cc using (constraint_schema, constraint_name)
  where tc.table_schema = 'public'
    and tc.table_name = 'automations'
    and tc.constraint_type = 'CHECK'
    and cc.check_clause like '%trigger_type%'
  limit 1;
  if check_name is not null then
    execute format('alter table public.automations drop constraint %I', check_name);
  end if;
end $$;

alter table public.automations
  add constraint automations_trigger_type_check
  check (trigger_type in ('crm_lead_created','quote_stale','order_delivered'));

-- A real, ready-to-use default so Day 16 ships as something staff can
-- turn on immediately rather than a feature they have to first know to
-- go build themselves. is_active: false -- staff should read/edit the
-- copy and confirm the delay before this starts emailing real customers,
-- not have it live the moment the migration runs. No unique constraint
-- on automations.name, so guarded with a not-exists check instead of
-- on conflict, safe to re-run.
insert into public.automations (name, trigger_type, delay_days, subject, body_html, is_active)
select
  'Post-Delivery Review Request',
  'order_delivered',
  3,
  'How did we do, {{first_name}}?',
  '<p>Hi {{first_name}},</p>' ||
  '<p>Your recent order from Room Ready Supply should have arrived by now &mdash; we hope everything showed up in great shape and is already put to work.</p>' ||
  '<p>If you have a minute, a quick review helps other hospitality and facility teams find us:</p>' ||
  '<p><a href="{{review_link}}">Leave a review on Google &rarr;</a></p>' ||
  '<p>Thank you for your business,<br>Room Ready Supply</p>',
  false
where not exists (
  select 1 from public.automations where trigger_type = 'order_delivered'
);
