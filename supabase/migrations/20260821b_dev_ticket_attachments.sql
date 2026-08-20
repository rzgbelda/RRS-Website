-- General file attachment (PDF, Word, Excel, etc.) for a dev ticket, kept
-- separate from screenshot_url on purpose: screenshots are always an image
-- and get rendered inline, this is any document and is offered as a
-- download link instead. attachment_name preserves the original filename
-- since the storage path itself is a generated, non-human-readable key.
alter table dev_tickets add column if not exists attachment_url text;
alter table dev_tickets add column if not exists attachment_name text;
