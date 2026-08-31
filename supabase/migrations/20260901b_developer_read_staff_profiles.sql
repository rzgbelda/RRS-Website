-- A developer account could only ever read its OWN profiles row
-- (own_profile_read: auth.uid() = id OR is_admin()) -- so the Dev Tickets
-- Assignee dropdown's profiles query always came back empty for a
-- developer, even after admin.js started asking it to fetch the list
-- (20260901_dev_ticket_triage_gate.sql made Developer the one actually
-- setting Assignee, but couldn't see anyone to assign to, not even
-- themselves). SELECT only, same reasoning as marketing_read_profiles
-- (20260828d_marketing_full_module_access.sql): a developer has no
-- business editing another account's role, full access there would
-- defeat the point of the role split.
drop policy if exists "developer_read_profiles" on public.profiles;
create policy "developer_read_profiles" on public.profiles for select using (public.is_developer());
