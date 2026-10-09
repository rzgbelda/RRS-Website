-- Repairs U+FFFD ("�", the Unicode replacement character) corruption
-- found across name/overview/feature2/feature3/feature4/variant_label on
-- 232 products. Root cause: admin.js's CSV upload tools (Converter,
-- direct Import, CRM Import) called FileReader.readAsText(file) with no
-- explicit encoding, letting the browser guess -- which silently
-- misdecoded multi-byte UTF-8 characters in at least one source CSV with
-- no byte-order mark. Fixed in admin.js (same commit as this migration)
-- by passing "UTF-8" explicitly to every readAsText() call; this
-- migration repairs the data already written before that fix existed.
--
-- Every occurrence across all 232 affected rows was individually
-- inspected (not assumed) by walking each "�" and classifying it by its
-- immediate surrounding characters -- confirmed zero occurrences fall
-- outside these three contexts:
--   1. "OEKO-TEX" immediately before it            -> "®" (U+00AE)
--   2. A letter immediately before it, "s" after it -> "’" (U+2019,
--      right single quotation mark -- a possessive, e.g. "manufacturer's")
--   3. A digit/quote (optionally with whitespace) on both sides
--      -> "×" (U+00D7, a dimension separator, e.g. 27" × 50")
-- Order matters: OEKO-TEX and the possessive-apostrophe pattern are
-- checked first since both involve a letter before the character, which
-- would otherwise be ambiguous with nothing else to go on.
--
-- chr(N) is used throughout instead of a literal pasted character or a
-- \uXXXX escape -- PostgreSQL's regex engine (POSIX ARE, not PCRE)
-- doesn't support \u Unicode escapes, and a literal non-ASCII character
-- pasted into this file risks yet another encoding mismatch depending on
-- how the SQL editor itself reads this file. chr(65533)=�, chr(174)=®,
-- chr(8217)=’, chr(215)=×: all plain integer code points, no ambiguity.

-- 1. OEKO-TEX® (registered trademark) -- checked first, most specific.
update public.products
set overview = regexp_replace(overview, 'OEKO-TEX' || chr(65533), 'OEKO-TEX' || chr(174), 'g')
where overview like '%OEKO-TEX' || chr(65533) || '%';

update public.products
set feature4 = regexp_replace(feature4, 'OEKO-TEX' || chr(65533), 'OEKO-TEX' || chr(174), 'g')
where feature4 like '%OEKO-TEX' || chr(65533) || '%';

-- 2. Possessive apostrophe ("manufacturer's", "property's", etc.) --
-- a letter immediately before the replacement character, "s" after it.
update public.products
set overview = regexp_replace(overview, '([A-Za-z])' || chr(65533) || '(s)', '\1' || chr(8217) || '\2', 'g')
where overview ~ ('[A-Za-z]' || chr(65533) || 's');

-- 3. Dimension separator ("27" × 50"", "24 × 50") -- a digit or quote
-- (with optional whitespace) on both sides. Applied to every remaining
-- column that had any match; the possessive/trademark updates above
-- already consumed their own contexts in overview/feature4, so this
-- final pass only ever touches genuine dimension separators.
update public.products
set name = regexp_replace(name, '([0-9"])\s*' || chr(65533) || '\s*([0-9])', '\1 ' || chr(215) || ' \2', 'g')
where name ~ ('[0-9"]\s*' || chr(65533) || '\s*[0-9]');

update public.products
set overview = regexp_replace(overview, '([0-9"])\s*' || chr(65533) || '\s*([0-9])', '\1 ' || chr(215) || ' \2', 'g')
where overview ~ ('[0-9"]\s*' || chr(65533) || '\s*[0-9]');

update public.products
set feature2 = regexp_replace(feature2, '([0-9"])\s*' || chr(65533) || '\s*([0-9])', '\1 ' || chr(215) || ' \2', 'g')
where feature2 ~ ('[0-9"]\s*' || chr(65533) || '\s*[0-9]');

update public.products
set feature3 = regexp_replace(feature3, '([0-9"])\s*' || chr(65533) || '\s*([0-9])', '\1 ' || chr(215) || ' \2', 'g')
where feature3 ~ ('[0-9"]\s*' || chr(65533) || '\s*[0-9]');

update public.products
set feature4 = regexp_replace(feature4, '([0-9"])\s*' || chr(65533) || '\s*([0-9])', '\1 ' || chr(215) || ' \2', 'g')
where feature4 ~ ('[0-9"]\s*' || chr(65533) || '\s*[0-9]');

update public.products
set variant_label = regexp_replace(variant_label, '([0-9"])\s*' || chr(65533) || '\s*([0-9])', '\1 ' || chr(215) || ' \2', 'g')
where variant_label ~ ('[0-9"]\s*' || chr(65533) || '\s*[0-9]');

-- Safety net: report any row where a replacement character still
-- remains after all three passes above, across every text column that
-- could plausibly carry one. An empty result confirms full repair; any
-- row returned here was NOT covered by the three known patterns and
-- needs manual inspection rather than a guessed blanket replacement.
select sku, name, overview, feature1, feature2, feature3, feature4, variant_label, product_family
from public.products
where name like '%' || chr(65533) || '%'
   or overview like '%' || chr(65533) || '%'
   or feature1 like '%' || chr(65533) || '%'
   or feature2 like '%' || chr(65533) || '%'
   or feature3 like '%' || chr(65533) || '%'
   or feature4 like '%' || chr(65533) || '%'
   or variant_label like '%' || chr(65533) || '%'
   or product_family like '%' || chr(65533) || '%';
