-- Reverts 20260902f_crm_campaigns_owner_readonly.sql: Owner accounts
-- should have full write access to CRM & Leads and Campaigns again, not
-- just read access. Restores the original single "for all using
-- (is_crm_staff())" policy per table -- is_crm_staff() = is_admin() OR
-- is_marketing(), so Owner (is_admin()) and Marketing both get full
-- read+write, identical to how it worked before 20260902f.

-- ============================================================
-- quote_requests / crm_activity_log (CRM & Leads)
-- ============================================================
drop policy if exists "crm_staff_read_quote_requests"   on public.quote_requests;
drop policy if exists "marketing_write_quote_requests"  on public.quote_requests;
drop policy if exists "marketing_update_quote_requests" on public.quote_requests;
drop policy if exists "marketing_delete_quote_requests" on public.quote_requests;
create policy "crm_staff_manage_quote_requests" on public.quote_requests
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());

drop policy if exists "crm_staff_read_activity_log"   on public.crm_activity_log;
drop policy if exists "marketing_write_activity_log"  on public.crm_activity_log;
drop policy if exists "marketing_update_activity_log" on public.crm_activity_log;
drop policy if exists "marketing_delete_activity_log" on public.crm_activity_log;
create policy "crm_staff_manage_activity_log" on public.crm_activity_log
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());

-- ============================================================
-- campaigns / campaign_content / email_templates (Campaigns)
-- ============================================================
drop policy if exists "crm_staff_read_campaigns"   on public.campaigns;
drop policy if exists "marketing_write_campaigns"  on public.campaigns;
drop policy if exists "marketing_update_campaigns" on public.campaigns;
drop policy if exists "marketing_delete_campaigns" on public.campaigns;
create policy "crm_staff_manage_campaigns" on public.campaigns
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());

drop policy if exists "crm_staff_read_campaign_content"   on public.campaign_content;
drop policy if exists "marketing_write_campaign_content"  on public.campaign_content;
drop policy if exists "marketing_update_campaign_content" on public.campaign_content;
drop policy if exists "marketing_delete_campaign_content" on public.campaign_content;
create policy "crm_staff_manage_campaign_content" on public.campaign_content
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());

drop policy if exists "crm_staff_read_email_templates"   on public.email_templates;
drop policy if exists "marketing_write_email_templates"  on public.email_templates;
drop policy if exists "marketing_update_email_templates" on public.email_templates;
drop policy if exists "marketing_delete_email_templates" on public.email_templates;
create policy "crm_staff_manage_email_templates" on public.email_templates
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());

-- ============================================================
-- automations (Campaigns -- drip/automation rules)
-- ============================================================
drop policy if exists "crm_staff_read_automations"   on public.automations;
drop policy if exists "marketing_write_automations"  on public.automations;
drop policy if exists "marketing_update_automations" on public.automations;
drop policy if exists "marketing_delete_automations" on public.automations;
create policy "crm_staff_manage_automations" on public.automations
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());

-- ============================================================
-- campaign_scheduled_sends (Campaigns -- scheduled sends)
-- ============================================================
drop policy if exists "crm_staff_read_scheduled_sends"   on public.campaign_scheduled_sends;
drop policy if exists "marketing_write_scheduled_sends"  on public.campaign_scheduled_sends;
drop policy if exists "marketing_update_scheduled_sends" on public.campaign_scheduled_sends;
drop policy if exists "marketing_delete_scheduled_sends" on public.campaign_scheduled_sends;
create policy "crm_staff_manage_scheduled_sends" on public.campaign_scheduled_sends
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());
