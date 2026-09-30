-- Short, stable slug per vendor: the key that ties products.distributor
-- (set from the CSV's distributor_name column) to a vendor row and its
-- warehouse ship-from address (20260930c).
--
-- products.distributor holds the slug ('starlinen', 'sasso', 'wraptite',
-- 'nps', 'imperial-brady'). Matching on a slug instead of the vendor's
-- display name means renaming "Star Linen Inc." in admin can't silently
-- break per-warehouse shipping for its products.

alter table public.vendors
  add column if not exists slug text;

create unique index if not exists vendors_slug_key
  on public.vendors (lower(slug)) where slug is not null;

-- Fill the known distributors from whatever name staff typed. Only touches
-- rows with no slug yet, so re-running is safe.
update public.vendors set slug = 'starlinen'      where slug is null and lower(name) like '%starlinen%';
update public.vendors set slug = 'starlinen'      where slug is null and lower(name) like '%star linen%';
update public.vendors set slug = 'wraptite'       where slug is null and lower(name) like '%wraptite%';
update public.vendors set slug = 'sasso'          where slug is null and lower(name) like '%sasso%';
update public.vendors set slug = 'nps'            where slug is null and (lower(name) = 'nps' or lower(name) like 'nps %' or lower(name) like '%nps holdings%');
update public.vendors set slug = 'imperial-brady' where slug is null and lower(name) like '%imperial%';

-- Verify -- every vendor should have a slug and a full address:
--   select name, slug, ship_from_street, ship_from_city, ship_from_state, ship_from_zip
--   from public.vendors order by name;
