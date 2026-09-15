-- Groups 151 same-product-different-size rows into 64 variant families, so
-- the storefront renders one card with a size dropdown instead of a separate
-- card per size (renderVariantCard in script.js groups on product_family and
-- labels each dropdown option with variant_label).
--
-- These products were imported by CSV before the importer could carry those
-- two columns (see the preceding commit), which is why the catalog shows
-- dozens of near-identical Bath Towel / Bath Mat / Washcloth cards.
--
-- Families are derived from the product name, which is consistently
--   "<Family> - <size>, <spec>, <color>, <pack>"
-- so the card title and its dropdown always describe the same thing.
--
-- Deliberate scope limits:
--  * Pack form (Case of 48 vs Individual) lives in the LABEL, not the family.
--    They are different SKUs at very different prices; merging them into one
--    option would hide that from the buyer.
--  * A family needs 2+ members. Single-size products stay ungrouped rather
--    than render a dropdown with one option.
--  * The 85 products already grouped (Bath Towel, Linen Microfiber Sheet,
--    Fleece Blanket, ...) are not touched -- no statement below targets a row
--    that already has a product_family.
--  * 76 rows stay ungrouped: 43 whose names carry no size separator and 33
--    that are the only member of their family.
--
-- Net effect: 312 catalog cards -> 225.

update public.products set product_family = '200 Hospitality Full Flat Sheet', variant_label = '81" × 102" - Case of 24' where sku = 'INN-BED-FLS-FL-81X102-T200-CS24';
update public.products set product_family = '200 Hospitality Full Flat Sheet', variant_label = '81" × 104" - Case of 24' where sku = 'INN-BED-FLS-FL-81X104-T200-CS24';
update public.products set product_family = '200 Hospitality Full Flat Sheet', variant_label = '81" × 104" - Individual' where sku = 'INN-BED-FLS-FL-81X104-T200-IND';
update public.products set product_family = '200 Hospitality Full Flat Sheet', variant_label = '81" × 109" - Case of 24' where sku = 'INN-BED-FLS-FL-81X109-T200-CS24';
update public.products set product_family = '200 Hospitality Full Flat Sheet', variant_label = '81" × 98" - Case of 24' where sku = 'INN-BED-FLS-FL-81X98-T200-CS24';
update public.products set product_family = '200 Hospitality King Fitted Sheet', variant_label = '78" × 80" × 12" - Case of 12' where sku = 'INN-BED-FTS-KG-78X80-P12-T200-CS12';
update public.products set product_family = '200 Hospitality King Fitted Sheet', variant_label = '78" × 80" × 12" - Individual' where sku = 'INN-BED-FTS-KG-78X80-P12-T200-IND';
update public.products set product_family = '200 Hospitality King Fitted Sheet', variant_label = '78" × 80" × 15" - Case of 12' where sku = 'INN-BED-FTS-KG-78X80-P15-T200-CS12';
update public.products set product_family = '200 Hospitality King Fitted Sheet', variant_label = '78" × 80" × 15" - Individual' where sku = 'INN-BED-FTS-KG-78X80-P15-T200-IND';
update public.products set product_family = '200 Hospitality King Flat Sheet', variant_label = '108" × 104" - Case of 12' where sku = 'INN-BED-FLS-KG-108X104-T200-CS12';
update public.products set product_family = '200 Hospitality King Flat Sheet', variant_label = '108" × 104" - Individual' where sku = 'INN-BED-FLS-KG-108X104-T200-IND';
update public.products set product_family = '200 Hospitality King Flat Sheet', variant_label = '108" × 109" - Case of 12' where sku = 'INN-BED-FLS-KG-108X109-T200-CS12';
update public.products set product_family = '200 Hospitality King Pillowcase', variant_label = '20" × 40" - Case of 72' where sku = 'INN-BED-PCS-KG-20X40-T200-CS72';
update public.products set product_family = '200 Hospitality King Pillowcase', variant_label = '20" × 40" - Individual' where sku = 'INN-BED-PCS-KG-20X40-T200-IND';
update public.products set product_family = '200 Hospitality King XL Flat Sheet', variant_label = '108" × 114" - Case of 12' where sku = 'INN-BED-FLS-KXL-108X114-T200-CS12';
update public.products set product_family = '200 Hospitality King XL Flat Sheet', variant_label = '108" × 114" - Individual' where sku = 'INN-BED-FLS-KXL-108X114-T200-IND';
update public.products set product_family = '200 Hospitality Queen Fitted Sheet', variant_label = '60" × 80" × 9" - Case of 12' where sku = 'INN-BED-FTS-QN-60X80-P09-T200-CS12';
update public.products set product_family = '200 Hospitality Queen Fitted Sheet', variant_label = '60" × 80" × 12" - Case of 12' where sku = 'INN-BED-FTS-QN-60X80-P12-T200-CS12';
update public.products set product_family = '200 Hospitality Queen Fitted Sheet', variant_label = '60" × 80" × 12" - Individual' where sku = 'INN-BED-FTS-QN-60X80-P12-T200-IND';
update public.products set product_family = '200 Hospitality Queen Fitted Sheet', variant_label = '60" × 80" × 15" - Case of 12' where sku = 'INN-BED-FTS-QN-60X80-P15-T200-CS12';
update public.products set product_family = '200 Hospitality Queen Fitted Sheet', variant_label = '60" × 80" × 15" - Individual' where sku = 'INN-BED-FTS-QN-60X80-P15-T200-IND';
update public.products set product_family = '200 Hospitality Queen Flat Sheet', variant_label = '90" × 104" - Case of 12' where sku = 'INN-BED-FLS-QN-90X104-T200-CS12';
update public.products set product_family = '200 Hospitality Queen Flat Sheet', variant_label = '90" × 104" - Individual' where sku = 'INN-BED-FLS-QN-90X104-T200-IND';
update public.products set product_family = '200 Hospitality Queen Flat Sheet', variant_label = '90" × 109" - Case of 12' where sku = 'INN-BED-FLS-QN-90X109-T200-CS12';
update public.products set product_family = '200 Hospitality Queen XL Flat Sheet', variant_label = '90" × 114" - Case of 12' where sku = 'INN-BED-FLS-QXL-90X114-T200-CS12';
update public.products set product_family = '200 Hospitality Queen XL Flat Sheet', variant_label = '90" × 114" - Individual' where sku = 'INN-BED-FLS-QXL-90X114-T200-IND';
update public.products set product_family = '200 Hospitality Standard Pillowcase', variant_label = '20" × 30" - Case of 72' where sku = 'INN-BED-PCS-STD-20X30-T200-CS72';
update public.products set product_family = '200 Hospitality Standard Pillowcase', variant_label = '20" × 30" - Individual' where sku = 'INN-BED-PCS-STD-20X30-T200-IND';
update public.products set product_family = '200 Hospitality Twin Fitted Sheet', variant_label = '39" × 75" × 9" - Case of 24' where sku = 'INN-BED-FTS-TW-39X75-P09-T200-CS24';
update public.products set product_family = '200 Hospitality Twin Fitted Sheet', variant_label = '39" × 75" × 12" - Case of 24' where sku = 'INN-BED-FTS-TW-39X75-P12-T200-CS24';
update public.products set product_family = '200 Hospitality Twin Fitted Sheet', variant_label = '39" × 75" × 12" - Individual' where sku = 'INN-BED-FTS-TW-39X75-P12-T200-IND';
update public.products set product_family = '200 Hospitality Twin Flat Sheet', variant_label = '66" × 102" - Case of 24' where sku = 'INN-BED-FLS-TW-66X102-T200-CS24';
update public.products set product_family = '200 Hospitality Twin Flat Sheet', variant_label = '66" × 104" - Case of 24' where sku = 'INN-BED-FLS-TW-66X104-T200-CS24';
update public.products set product_family = '200 Hospitality Twin Flat Sheet', variant_label = '66" × 109" - Case of 24' where sku = 'INN-BED-FLS-TW-66X109-T200-CS24';
update public.products set product_family = '200 Hospitality Twin Flat Sheet', variant_label = '66" × 109" - Individual' where sku = 'INN-BED-FLS-TW-66X109-T200-IND';
update public.products set product_family = '200 Hospitality Twin Flat Sheet', variant_label = '66" × 98" - Case of 24' where sku = 'INN-BED-FLS-TW-66X98-T200-CS24';
update public.products set product_family = '200 Hospitality Twin XL Fitted Sheet', variant_label = '39" × 80" × 9" - Case of 24' where sku = 'INN-BED-FTS-TXL-39X80-P09-T200-CS24';
update public.products set product_family = '200 Hospitality Twin XL Fitted Sheet', variant_label = '39" × 80" × 9" - Individual' where sku = 'INN-BED-FTS-TXL-39X80-P09-T200-IND';
update public.products set product_family = '200 Hospitality Twin XL Fitted Sheet', variant_label = '39" × 80" × 12" - Case of 24' where sku = 'INN-BED-FTS-TXL-39X80-P12-T200-CS24';
update public.products set product_family = '300 Hospitality Full Flat Sheet', variant_label = '81" × 109" - Case of 24' where sku = 'INN-BED-FLS-FL-81X109-T300-CS24';
update public.products set product_family = '300 Hospitality Full Flat Sheet', variant_label = '81" × 109" - Individual' where sku = 'INN-BED-FLS-FL-81X109-T300-IND';
update public.products set product_family = '300 Hospitality Full XL Fitted Sheet', variant_label = '54" × 80" × 12" - Case of 24' where sku = 'INN-BED-FTS-FXL-54X80-P12-T300-CS24';
update public.products set product_family = '300 Hospitality Full XL Fitted Sheet', variant_label = '54" × 80" × 12" - Individual' where sku = 'INN-BED-FTS-FXL-54X80-P12-T300-IND';
update public.products set product_family = '300 Hospitality Full XL Fitted Sheet', variant_label = '54" × 80" × 15" - Case of 24' where sku = 'INN-BED-FTS-FXL-54X80-P15-T300-CS24';
update public.products set product_family = '300 Hospitality King Fitted Sheet', variant_label = '78" × 80" × 12" - Case of 12' where sku = 'INN-BED-FTS-KG-78X80-P12-T300-CS12';
update public.products set product_family = '300 Hospitality King Fitted Sheet', variant_label = '78" × 80" × 15" - Case of 12' where sku = 'INN-BED-FTS-KG-78X80-P15-T300-CS12';
update public.products set product_family = '300 Hospitality King Fitted Sheet', variant_label = '78" × 80" × 15" - Individual' where sku = 'INN-BED-FTS-KG-78X80-P15-T300-IND';
update public.products set product_family = '300 Hospitality King Flat Sheet', variant_label = '108" × 109" - Case of 12' where sku = 'INN-BED-FLS-KG-108X109-T300-CS12';
update public.products set product_family = '300 Hospitality King Flat Sheet', variant_label = '108" × 109" - Individual' where sku = 'INN-BED-FLS-KG-108X109-T300-IND';
update public.products set product_family = '300 Hospitality King Pillowcase', variant_label = '20" × 40" - Case of 72' where sku = 'INN-BED-PCS-KG-20X40-T300-CS72';
update public.products set product_family = '300 Hospitality King Pillowcase', variant_label = '20" × 40" - Individual' where sku = 'INN-BED-PCS-KG-20X40-T300-IND';
update public.products set product_family = '300 Hospitality King XL Flat Sheet', variant_label = '108" × 114" - Case of 12' where sku = 'INN-BED-FLS-KXL-108X114-T300-CS12';
update public.products set product_family = '300 Hospitality King XL Flat Sheet', variant_label = '108" × 114" - Individual' where sku = 'INN-BED-FLS-KXL-108X114-T300-IND';
update public.products set product_family = '300 Hospitality Queen Fitted Sheet', variant_label = '60" × 80" × 12" - Case of 12' where sku = 'INN-BED-FTS-QN-60X80-P12-T300-CS12';
update public.products set product_family = '300 Hospitality Queen Fitted Sheet', variant_label = '60" × 80" × 12" - Individual' where sku = 'INN-BED-FTS-QN-60X80-P12-T300-IND';
update public.products set product_family = '300 Hospitality Queen Fitted Sheet', variant_label = '60" × 80" × 15" - Case of 12' where sku = 'INN-BED-FTS-QN-60X80-P15-T300-CS12';
update public.products set product_family = '300 Hospitality Queen Fitted Sheet', variant_label = '60" × 80" × 15" - Individual' where sku = 'INN-BED-FTS-QN-60X80-P15-T300-IND';
update public.products set product_family = '300 Hospitality Queen Flat Sheet', variant_label = '90" × 109" - Case of 12' where sku = 'INN-BED-FLS-QN-90X109-T300-CS12';
update public.products set product_family = '300 Hospitality Queen Flat Sheet', variant_label = '90" × 109" - Individual' where sku = 'INN-BED-FLS-QN-90X109-T300-IND';
update public.products set product_family = '300 Hospitality Queen Pillowcase', variant_label = '20" × 34" - Case of 72' where sku = 'INN-BED-PCS-QN-20X34-T300-CS72';
update public.products set product_family = '300 Hospitality Queen Pillowcase', variant_label = '20" × 34" - Individual' where sku = 'INN-BED-PCS-QN-20X34-T300-IND';
update public.products set product_family = '300 Hospitality Queen XL Flat Sheet', variant_label = '90" × 114" - Case of 12' where sku = 'INN-BED-FLS-QXL-90X114-T300-CS12';
update public.products set product_family = '300 Hospitality Queen XL Flat Sheet', variant_label = '90" × 114" - Individual' where sku = 'INN-BED-FLS-QXL-90X114-T300-IND';
update public.products set product_family = '300 Hospitality Standard Pillowcase', variant_label = '20" × 30" - Case of 72' where sku = 'INN-BED-PCS-STD-20X30-T300-CS72';
update public.products set product_family = '300 Hospitality Standard Pillowcase', variant_label = '20" × 30" - Individual' where sku = 'INN-BED-PCS-STD-20X30-T300-IND';
update public.products set product_family = '300 Hospitality Twin Flat Sheet', variant_label = '66" × 109" - Case of 24' where sku = 'INN-BED-FLS-TW-66X109-T300-CS24';
update public.products set product_family = '300 Hospitality Twin Flat Sheet', variant_label = '66" × 109" - Individual' where sku = 'INN-BED-FLS-TW-66X109-T300-IND';
update public.products set product_family = '300 Hospitality Twin XL Fitted Sheet', variant_label = '39" × 80" × 12" - Case of 24' where sku = 'INN-BED-FTS-TXL-39X80-P12-T300-CS24';
update public.products set product_family = '300 Hospitality Twin XL Fitted Sheet', variant_label = '39" × 80" × 12" - Individual' where sku = 'INN-BED-FTS-TXL-39X80-P12-T300-IND';
update public.products set product_family = '600 Luxury Blend Full Fitted Sheet', variant_label = '54" × 75" × 12" - Case of 24' where sku = 'INN-BED-FTS-FL-54X75-P12-T600-LXB-CS24';
update public.products set product_family = '600 Luxury Blend Full Fitted Sheet', variant_label = '54" × 75" × 12" - Individual' where sku = 'INN-BED-FTS-FL-54X75-P12-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend Full Flat Sheet', variant_label = '81" × 109" - Case of 24' where sku = 'INN-BED-FLS-FL-81X109-T600-LXB-CS24';
update public.products set product_family = '600 Luxury Blend Full Flat Sheet', variant_label = '81" × 109" - Individual' where sku = 'INN-BED-FLS-FL-81X109-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend Full Sheet Set', variant_label = 'Fresh White - Case of 4 Sets' where sku = 'INN-BED-SST-FL-T600-LXB-CS4';
update public.products set product_family = '600 Luxury Blend Full Sheet Set', variant_label = 'Fresh White - Individual Set' where sku = 'INN-BED-SST-FL-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend King Fitted Sheet', variant_label = '78" × 80" × 15" - Case of 12' where sku = 'INN-BED-FTS-KG-78X80-P15-T600-LXB-CS12';
update public.products set product_family = '600 Luxury Blend King Fitted Sheet', variant_label = '78" × 80" × 15" - Individual' where sku = 'INN-BED-FTS-KG-78X80-P15-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend King Flat Sheet', variant_label = '108" × 109" - Case of 12' where sku = 'INN-BED-FLS-KG-108X109-T600-LXB-CS12';
update public.products set product_family = '600 Luxury Blend King Flat Sheet', variant_label = '108" × 109" - Individual' where sku = 'INN-BED-FLS-KG-108X109-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend King Pillowcase', variant_label = '20" × 40" - Case of 72' where sku = 'INN-BED-PCS-KG-20X40-T600-LXB-CS72';
update public.products set product_family = '600 Luxury Blend King Pillowcase', variant_label = '20" × 40" - Individual' where sku = 'INN-BED-PCS-KG-20X40-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend King Sheet Set', variant_label = 'Fresh White - Case of 4 Sets' where sku = 'INN-BED-SST-KG-T600-LXB-CS4';
update public.products set product_family = '600 Luxury Blend King Sheet Set', variant_label = 'Fresh White - Individual Set' where sku = 'INN-BED-SST-KG-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend King XL Flat Sheet', variant_label = '108" × 114" - Case of 12' where sku = 'INN-BED-FLS-KXL-108X114-T600-LXB-CS12';
update public.products set product_family = '600 Luxury Blend King XL Flat Sheet', variant_label = '108" × 114" - Individual' where sku = 'INN-BED-FLS-KXL-108X114-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend Queen Fitted Sheet', variant_label = '60" × 80" × 15" - Case of 12' where sku = 'INN-BED-FTS-QN-60X80-P15-T600-LXB-CS12';
update public.products set product_family = '600 Luxury Blend Queen Fitted Sheet', variant_label = '60" × 80" × 15" - Individual' where sku = 'INN-BED-FTS-QN-60X80-P15-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend Queen Flat Sheet', variant_label = '90" × 109" - Case of 12' where sku = 'INN-BED-FLS-QN-90X109-T600-LXB-CS12';
update public.products set product_family = '600 Luxury Blend Queen Flat Sheet', variant_label = '90" × 109" - Individual' where sku = 'INN-BED-FLS-QN-90X109-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend Queen Pillowcase', variant_label = '20" × 34" - Case of 72' where sku = 'INN-BED-PCS-QN-20X34-T600-LXB-CS72';
update public.products set product_family = '600 Luxury Blend Queen Pillowcase', variant_label = '20" × 34" - Individual' where sku = 'INN-BED-PCS-QN-20X34-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend Queen Sheet Set', variant_label = 'Fresh White - Case of 4 Sets' where sku = 'INN-BED-SST-QN-T600-LXB-CS4';
update public.products set product_family = '600 Luxury Blend Queen Sheet Set', variant_label = 'Fresh White - Individual Set' where sku = 'INN-BED-SST-QN-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend Queen XL Flat Sheet', variant_label = '90" × 114" - Case of 12' where sku = 'INN-BED-FLS-QXL-90X114-T600-LXB-CS12';
update public.products set product_family = '600 Luxury Blend Queen XL Flat Sheet', variant_label = '90" × 114" - Individual' where sku = 'INN-BED-FLS-QXL-90X114-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend Twin Fitted Sheet', variant_label = '39" × 75" × 12" - Case of 24' where sku = 'INN-BED-FTS-TW-39X75-P12-T600-LXB-CS24';
update public.products set product_family = '600 Luxury Blend Twin Fitted Sheet', variant_label = '39" × 75" × 12" - Individual' where sku = 'INN-BED-FTS-TW-39X75-P12-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend Twin Sheet Set', variant_label = 'Fresh White - Case of 4 Sets' where sku = 'INN-BED-SST-TW-T600-LXB-CS4';
update public.products set product_family = '600 Luxury Blend Twin Sheet Set', variant_label = 'Fresh White - Individual Set' where sku = 'INN-BED-SST-TW-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend Twin XL Fitted Sheet', variant_label = '39" × 80" × 12" - Case of 24' where sku = 'INN-BED-FTS-TXL-39X80-P12-T600-LXB-CS24';
update public.products set product_family = '600 Luxury Blend Twin XL Fitted Sheet', variant_label = '39" × 80" × 12" - Individual' where sku = 'INN-BED-FTS-TXL-39X80-P12-T600-LXB-IND';
update public.products set product_family = '600 Luxury Blend Twin XL Flat Sheet', variant_label = '66" × 109" - Case of 24' where sku = 'INN-BED-FLS-TXL-66X109-T600-LXB-CS24';
update public.products set product_family = '600 Luxury Blend Twin XL Flat Sheet', variant_label = '66" × 109" - Individual' where sku = 'INN-BED-FLS-TXL-66X109-T600-LXB-IND';
update public.products set product_family = '600 Wrinkle-Free California King Sheet Set', variant_label = '16" Pocket - Case of 4 Sets' where sku = 'INN-BED-SST-CKG-P16-T600-WRF-CS4';
update public.products set product_family = '600 Wrinkle-Free California King Sheet Set', variant_label = '16" Pocket - Individual Set' where sku = 'INN-BED-SST-CKG-P16-T600-WRF-IND';
update public.products set product_family = '600 Wrinkle-Free Full Sheet Set', variant_label = '16" Pocket - Case of 4 Sets' where sku = 'INN-BED-SST-FL-P16-T600-WRF-CS4';
update public.products set product_family = '600 Wrinkle-Free Full Sheet Set', variant_label = '16" Pocket - Individual Set' where sku = 'INN-BED-SST-FL-P16-T600-WRF-IND';
update public.products set product_family = '600 Wrinkle-Free King Pillowcase Pair', variant_label = '21" × 40" - Case of 6 Pairs' where sku = 'INN-BED-PCP-KG-21X40-T600-WRF-CS6PR';
update public.products set product_family = '600 Wrinkle-Free King Pillowcase Pair', variant_label = '21" × 40" - Individual Pair' where sku = 'INN-BED-PCP-KG-21X40-T600-WRF-INDPR';
update public.products set product_family = '600 Wrinkle-Free King Sheet Set', variant_label = '16" Pocket - Case of 4 Sets' where sku = 'INN-BED-SST-KG-P16-T600-WRF-CS4';
update public.products set product_family = '600 Wrinkle-Free King Sheet Set', variant_label = '16" Pocket - Individual Set' where sku = 'INN-BED-SST-KG-P16-T600-WRF-IND';
update public.products set product_family = '600 Wrinkle-Free Queen Sheet Set', variant_label = '16" Pocket - Case of 4 Sets' where sku = 'INN-BED-SST-QN-P16-T600-WRF-CS4';
update public.products set product_family = '600 Wrinkle-Free Queen Sheet Set', variant_label = '16" Pocket - Individual Set' where sku = 'INN-BED-SST-QN-P16-T600-WRF-IND';
update public.products set product_family = '600 Wrinkle-Free Standard/Queen Pillowcase Pair', variant_label = '21" × 32" - Case of 6 Pairs' where sku = 'INN-BED-PCP-STQ-21X32-T600-WRF-CS6PR';
update public.products set product_family = '600 Wrinkle-Free Standard/Queen Pillowcase Pair', variant_label = '21" × 32" - Individual Pair' where sku = 'INN-BED-PCP-STQ-21X32-T600-WRF-INDPR';
update public.products set product_family = '600 Wrinkle-Free Twin Sheet Set', variant_label = '16" Pocket - Case of 4 Sets' where sku = 'INN-BED-SST-TW-P16-T600-WRF-CS4';
update public.products set product_family = '600 Wrinkle-Free Twin Sheet Set', variant_label = '16" Pocket - Individual Set' where sku = 'INN-BED-SST-TW-P16-T600-WRF-IND';
update public.products set product_family = '600 Wrinkle-Free Twin XL Sheet Set', variant_label = '16" Pocket - Case of 4 Sets' where sku = 'INN-BED-SST-TXL-P16-T600-WRF-CS4';
update public.products set product_family = '600 Wrinkle-Free Twin XL Sheet Set', variant_label = '16" Pocket - Individual Set' where sku = 'INN-BED-SST-TXL-P16-T600-WRF-IND';
update public.products set product_family = 'Luxury Turkish Bath Mat', variant_label = '22" × 34" - Case of 20' where sku = 'INN-TWL-BMT-22X34-LUX-CS20';
update public.products set product_family = 'Luxury Turkish Bath Mat', variant_label = '22" × 34" - Individual' where sku = 'INN-TWL-BMT-22X34-LUX-IND';
update public.products set product_family = 'Luxury Turkish Bath Sheet', variant_label = '30" × 60" - Case of 12' where sku = 'INN-TWL-BSH-30X60-LUX-CS12';
update public.products set product_family = 'Luxury Turkish Bath Sheet', variant_label = '30" × 60" - Individual' where sku = 'INN-TWL-BSH-30X60-LUX-IND';
update public.products set product_family = 'Luxury Turkish Bath Towel', variant_label = '27" × 58" - Case of 14' where sku = 'INN-TWL-BTW-27X58-LUX-CS14';
update public.products set product_family = 'Luxury Turkish Bath Towel', variant_label = '27" × 58" - Individual' where sku = 'INN-TWL-BTW-27X58-LUX-IND';
update public.products set product_family = 'Luxury Turkish Hand Towel', variant_label = '16" × 30" - Case of 42' where sku = 'INN-TWL-HTW-16X30-LUX-CS42';
update public.products set product_family = 'Luxury Turkish Hand Towel', variant_label = '16" × 30" - Individual' where sku = 'INN-TWL-HTW-16X30-LUX-IND';
update public.products set product_family = 'Luxury Turkish Washcloth', variant_label = '13" × 13" - Case of 110' where sku = 'INN-TWL-WCL-13X13-LUX-CS110';
update public.products set product_family = 'Luxury Turkish Washcloth', variant_label = '13" × 13" - Individual' where sku = 'INN-TWL-WCL-13X13-LUX-IND';
update public.products set product_family = 'Ringspun Cotton Bath Mat', variant_label = '20" × 30" - Case of 60' where sku = 'INN-TWL-BMT-20X30-RSP-CS60';
update public.products set product_family = 'Ringspun Cotton Bath Mat', variant_label = '20" × 30" - Individual' where sku = 'INN-TWL-BMT-20X30-RSP-IND';
update public.products set product_family = 'Ringspun Cotton Bath Mat', variant_label = '22" × 34" - Case of 60' where sku = 'INN-TWL-BMT-22X34-RSP-CS60';
update public.products set product_family = 'Ringspun Cotton Bath Mat', variant_label = '22" × 34" - Individual' where sku = 'INN-TWL-BMT-22X34-RSP-IND';
update public.products set product_family = 'Ringspun Cotton Bath Towel', variant_label = '27" × 50" - Case of 48' where sku = 'INN-TWL-BTW-27X50-RSP-CS48';
update public.products set product_family = 'Ringspun Cotton Bath Towel', variant_label = '27" × 50" - Individual' where sku = 'INN-TWL-BTW-27X50-RSP-IND';
update public.products set product_family = 'Ringspun Cotton Bath Towel', variant_label = '27" × 54" - Case of 36' where sku = 'INN-TWL-BTW-27X54-RSP-CS36';
update public.products set product_family = 'Ringspun Cotton Bath Towel', variant_label = '27" × 54" - Individual' where sku = 'INN-TWL-BTW-27X54-RSP-IND';
update public.products set product_family = 'Ringspun Cotton Double-Dobby Bath Towel', variant_label = '30" × 60" - Case of 24' where sku = 'INN-TWL-BTW-30X60-RSP-DBL-CS24';
update public.products set product_family = 'Ringspun Cotton Double-Dobby Bath Towel', variant_label = '30" × 60" - Individual' where sku = 'INN-TWL-BTW-30X60-RSP-DBL-IND';
update public.products set product_family = 'Ringspun Cotton Hand Towel', variant_label = '16" × 30" - Case of 120' where sku = 'INN-TWL-HTW-16X30-RSP-CS120';
update public.products set product_family = 'Ringspun Cotton Hand Towel', variant_label = '16" × 30" - Individual' where sku = 'INN-TWL-HTW-16X30-RSP-IND';
update public.products set product_family = 'Ringspun Cotton Washcloth', variant_label = '13" × 13" - Case of 300' where sku = 'INN-TWL-WCL-13X13-RSP-CS300';
update public.products set product_family = 'Ringspun Cotton Washcloth', variant_label = '13" × 13" - Individual' where sku = 'INN-TWL-WCL-13X13-RSP-IND';
update public.products set product_family = 'Suites Bath Mat', variant_label = '20" × 35" - Case of 12' where sku = 'INN-TWL-BMT-20X35-SUI-CS12';
update public.products set product_family = 'Suites Bath Mat', variant_label = '20" × 35" - Individual' where sku = 'INN-TWL-BMT-20X35-SUI-IND';
update public.products set product_family = 'Suites Bath Towel', variant_label = '30" × 56" - Case of 12' where sku = 'INN-TWL-BTW-30X56-SUI-CS12';
update public.products set product_family = 'Suites Bath Towel', variant_label = '30" × 56" - Individual' where sku = 'INN-TWL-BTW-30X56-SUI-IND';
update public.products set product_family = 'Suites Hand Towel', variant_label = '16" × 28" - Case of 24' where sku = 'INN-TWL-HTW-16X28-SUI-CS24';
update public.products set product_family = 'Suites Hand Towel', variant_label = '16" × 28" - Individual' where sku = 'INN-TWL-HTW-16X28-SUI-IND';
update public.products set product_family = 'Suites Washcloth', variant_label = '13" × 13" - Case of 48' where sku = 'INN-TWL-WCL-13X13-SUI-CS48';
update public.products set product_family = 'Suites Washcloth', variant_label = '13" × 13" - Individual' where sku = 'INN-TWL-WCL-13X13-SUI-IND';

-- Verify:
--   select product_family, count(*) c, string_agg(variant_label, chr(124) order by variant_label)
--   from public.products where product_family is not null group by 1 order by c desc;
--   -- expect 85 families total (21 pre-existing + 64 new), none with 1 member.
