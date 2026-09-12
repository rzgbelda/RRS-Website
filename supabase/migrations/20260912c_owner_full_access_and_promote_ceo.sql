-- Restores full write access for the owner role on the CRM and Campaigns
-- tables, and promotes the CEO's account to that role.
--
-- Background: 20260902f deliberately split those tables into read for
-- is_crm_staff() (owner + marketing) and write for is_marketing() only,
-- so that owner had oversight but could not change CRM/Campaigns. That
-- was the intent at the time.
--
-- It is being reversed now on the CEO's own instruction: his account
-- (eric@roomreadysupply.com) has been running as role='marketing', which
-- is why the owner-only invoice credit added in 20260912b appeared
-- locked to him. Promoting him to 'owner' without this change would have
-- traded one restriction for a worse one -- he would gain credits, Users
-- and Settings but LOSE the ability to edit CRM leads, campaigns, email
-- templates, automations and scheduled sends, all of which he uses today.
--
-- So owner now means what its name implies: unrestricted. Marketing keeps
-- exactly the write access it already had -- nothing is taken away from
-- that role here.
--
-- Note this does NOT widen who can issue an invoice credit. That stays
-- owner-only, enforced by is_owner() and the trigger from 20260912b;
-- marketing still cannot set one. The difference is only that the CEO is
-- now actually an owner.

-- ============================================================
-- CRM & Leads
-- ============================================================
-- quote_requests already got its owner UPDATE policy in 20260912b; this
-- adds the insert/delete halves so the table is consistent with the rest.
drop policy if exists "owner_write_quote_requests" on public.quote_requests;
create policy "owner_write_quote_requests" on public.quote_requests
  for insert with check (public.is_owner());
drop policy if exists "owner_delete_quote_requests" on public.quote_requests;
create policy "owner_delete_quote_requests" on public.quote_requests
  for delete using (public.is_owner());

drop policy if exists "owner_write_activity_log" on public.crm_activity_log;
create policy "owner_write_activity_log" on public.crm_activity_log
  for insert with check (public.is_owner());
drop policy if exists "owner_update_activity_log" on public.crm_activity_log;
create policy "owner_update_activity_log" on public.crm_activity_log
  for update using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner_delete_activity_log" on public.crm_activity_log;
create policy "owner_delete_activity_log" on public.crm_activity_log
  for delete using (public.is_owner());

-- ============================================================
-- Campaigns
-- ============================================================
drop policy if exists "owner_write_campaigns" on public.campaigns;
create policy "owner_write_campaigns" on public.campaigns
  for insert with check (public.is_owner());
drop policy if exists "owner_update_campaigns" on public.campaigns;
create policy "owner_update_campaigns" on public.campaigns
  for update using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner_delete_campaigns" on public.campaigns;
create policy "owner_delete_campaigns" on public.campaigns
  for delete using (public.is_owner());

drop policy if exists "owner_write_campaign_content" on public.campaign_content;
create policy "owner_write_campaign_content" on public.campaign_content
  for insert with check (public.is_owner());
drop policy if exists "owner_update_campaign_content" on public.campaign_content;
create policy "owner_update_campaign_content" on public.campaign_content
  for update using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner_delete_campaign_content" on public.campaign_content;
create policy "owner_delete_campaign_content" on public.campaign_content
  for delete using (public.is_owner());

drop policy if exists "owner_write_email_templates" on public.email_templates;
create policy "owner_write_email_templates" on public.email_templates
  for insert with check (public.is_owner());
drop policy if exists "owner_update_email_templates" on public.email_templates;
create policy "owner_update_email_templates" on public.email_templates
  for update using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner_delete_email_templates" on public.email_templates;
create policy "owner_delete_email_templates" on public.email_templates
  for delete using (public.is_owner());

drop policy if exists "owner_write_automations" on public.automations;
create policy "owner_write_automations" on public.automations
  for insert with check (public.is_owner());
drop policy if exists "owner_update_automations" on public.automations;
create policy "owner_update_automations" on public.automations
  for update using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner_delete_automations" on public.automations;
create policy "owner_delete_automations" on public.automations
  for delete using (public.is_owner());

drop policy if exists "owner_write_scheduled_sends" on public.campaign_scheduled_sends;
create policy "owner_write_scheduled_sends" on public.campaign_scheduled_sends
  for insert with check (public.is_owner());
drop policy if exists "owner_update_scheduled_sends" on public.campaign_scheduled_sends;
create policy "owner_update_scheduled_sends" on public.campaign_scheduled_sends
  for update using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner_delete_scheduled_sends" on public.campaign_scheduled_sends;
create policy "owner_delete_scheduled_sends" on public.campaign_scheduled_sends
  for delete using (public.is_owner());

-- ============================================================
-- Promote the CEO
-- ============================================================
-- Matched on email rather than a hardcoded uuid so this reads clearly and
-- fails visibly (0 rows) if the address is ever different than expected.
update public.profiles
set role = 'owner'
where email = 'eric@roomreadysupply.com';

-- Verify:
--   select email, full_name, role from public.profiles where role = 'owner';
--   -- expect eric@roomreadysupply.com listed as owner.
--   -- Eric must sign out and back in: admin.js reads the role once at login.
