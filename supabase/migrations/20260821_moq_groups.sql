-- General-purpose Mix & Match MOQ groups: any product can be tagged into a
-- named group (e.g. "5GAL-CHEMICALS") with a combined-quantity minimum that
-- applies across every product sharing that tag, not per-item. Storing the
-- minimum on each row (rather than a separate moq_groups table) is a
-- deliberate small duplication -- every product in a group is expected to
-- carry the same number, and this avoids a join just to render a progress
-- bar or validate a cart. Both null for any product with no group MOQ.
alter table products add column if not exists moq_group text;
alter table products add column if not exists moq_group_min integer;
