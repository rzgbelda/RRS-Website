-- Lets a ticket comment show "(edited)" once its author changes it after
-- posting -- comments had no edit/delete UI at all before this.
alter table dev_ticket_comments add column if not exists edited_at timestamptz;
