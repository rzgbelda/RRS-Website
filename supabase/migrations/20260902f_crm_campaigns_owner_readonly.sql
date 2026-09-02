-- Owner should be able to SEE CRM/Leads and Campaigns (oversight), but
-- never CHANGE anything there -- only the marketing role configures or
-- edits those sections. Previously every CRM/Campaigns table used a
-- single "for all using (is_crm_staff())" policy, where is_crm_staff()
-- = is_admin() OR is_marketing() -- meaning Owner (an is_admin() account)
-- had full read+write, identical to Marketing. This splits each of those
-- into a read policy (is_crm_staff(): Owner + Marketing) and a write
-- policy (is_marketing() only: insert/update/delete).
--
-- Deliberately NOT changed by this migration: is_admin() itself (fixed
-- separately in 20260902e for the 'owner' role-name gap -- that fix is
-- still correct and needed, this migration only narrows what admin-level
-- access means specifically for these CRM/Campaigns tables), and
-- public.articles (blog CMS -- not part of "CRM & Leads, and Campaigns"
-- as scoped for this change, stays is_crm_staff() for all as before).

-- ============================================================
-- quote_requests / crm_activity_log (CRM & Leads)
-- ============================================================
drop policy if exists "crm_staff_manage_quote_requests" on public.quote_requests;
create policy "crm_staff_read_quote_requests" on public.quote_requests
  for select using (public.is_crm_staff());
create policy "marketing_write_quote_requests" on public.quote_requests
  for insert with check (public.is_marketing());
create policy "marketing_update_quote_requests" on public.quote_requests
  for update using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_delete_quote_requests" on public.quote_requests
  for delete using (public.is_marketing());

drop policy if exists "crm_staff_manage_activity_log" on public.crm_activity_log;
create policy "crm_staff_read_activity_log" on public.crm_activity_log
  for select using (public.is_crm_staff());
create policy "marketing_write_activity_log" on public.crm_activity_log
  for insert with check (public.is_marketing());
create policy "marketing_update_activity_log" on public.crm_activity_log
  for update using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_delete_activity_log" on public.crm_activity_log
  for delete using (public.is_marketing());

-- ============================================================
-- campaigns / campaign_content / email_templates (Campaigns)
-- ============================================================
drop policy if exists "crm_staff_manage_campaigns" on public.campaigns;
create policy "crm_staff_read_campaigns" on public.campaigns
  for select using (public.is_crm_staff());
create policy "marketing_write_campaigns" on public.campaigns
  for insert with check (public.is_marketing());
create policy "marketing_update_campaigns" on public.campaigns
  for update using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_delete_campaigns" on public.campaigns
  for delete using (public.is_marketing());

drop policy if exists "crm_staff_manage_campaign_content" on public.campaign_content;
create policy "crm_staff_read_campaign_content" on public.campaign_content
  for select using (public.is_crm_staff());
create policy "marketing_write_campaign_content" on public.campaign_content
  for insert with check (public.is_marketing());
create policy "marketing_update_campaign_content" on public.campaign_content
  for update using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_delete_campaign_content" on public.campaign_content
  for delete using (public.is_marketing());

drop policy if exists "crm_staff_manage_email_templates" on public.email_templates;
create policy "crm_staff_read_email_templates" on public.email_templates
  for select using (public.is_crm_staff());
create policy "marketing_write_email_templates" on public.email_templates
  for insert with check (public.is_marketing());
create policy "marketing_update_email_templates" on public.email_templates
  for update using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_delete_email_templates" on public.email_templates
  for delete using (public.is_marketing());

-- ============================================================
-- automations (Campaigns -- drip/automation rules)
-- ============================================================
drop policy if exists "crm_staff_manage_automations" on public.automations;
create policy "crm_staff_read_automations" on public.automations
  for select using (public.is_crm_staff());
create policy "marketing_write_automations" on public.automations
  for insert with check (public.is_marketing());
create policy "marketing_update_automations" on public.automations
  for update using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_delete_automations" on public.automations
  for delete using (public.is_marketing());

-- ============================================================
-- campaign_scheduled_sends (Campaigns -- scheduled sends)
-- ============================================================
drop policy if exists "crm_staff_manage_scheduled_sends" on public.campaign_scheduled_sends;
create policy "crm_staff_read_scheduled_sends" on public.campaign_scheduled_sends
  for select using (public.is_crm_staff());
create policy "marketing_write_scheduled_sends" on public.campaign_scheduled_sends
  for insert with check (public.is_marketing());
create policy "marketing_update_scheduled_sends" on public.campaign_scheduled_sends
  for update using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_delete_scheduled_sends" on public.campaign_scheduled_sends
  for delete using (public.is_marketing());

-- campaign_email_events and automation_sends already have SELECT-only
-- policies (crm_staff_read_email_events, crm_staff_read_automation_sends)
-- with no write policy for any human role at all -- both tables are only
-- ever written by the Resend webhook / cron sweep via the service-role
-- key, which bypasses RLS entirely. Nothing to change there.
