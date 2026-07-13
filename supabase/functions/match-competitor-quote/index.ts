import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATALOG = [
  // TOWELS
  { id: "RDU-TWL-WCL-12X12-ECO", name: "Economy 12x12 Wash Cloths", cat: "Towels", specs: "12x12 inch, cotton/poly economy, 600/case (50 dozen)", price: 3.03 },
  { id: "RDU-TWL-HTW-16X27-ECO", name: "Economy 16x27 Hand Towels", cat: "Towels", specs: "16x27 inch, cotton/poly economy, 120/case (10 dozen)", price: 9.64 },
  { id: "RDU-TWL-BTW-22X44-ECO", name: "Economy 22x44 Bath Towels", cat: "Towels", specs: "22x44 inch, cotton/poly economy, 120/case (10 dozen)", price: 18.17 },
  { id: "RDU-TWL-BTW-24X48-ECO", name: "Economy 24x48 Bath Towels", cat: "Towels", specs: "24x48 inch, cotton/poly economy, 60/case (5 dozen)", price: 25.36 },
  { id: "RDU-TWL-BTW-24X50-ECO", name: "Economy 24x50 Bath Towels", cat: "Towels", specs: "24x50 inch, cotton/poly economy, 60/case (5 dozen)", price: 28.41 },
  { id: "RDU-TWL-BMT-20X30-ECO", name: "Economy 20x30 Bath Mats", cat: "Towels", specs: "20x30 inch bath mat, cotton/poly economy, 60/case (5 dozen)", price: 20.29 },
  { id: "RDU-TWL-WCL-12X12-PRM", name: "Premium 12x12 Wash Cloths", cat: "Towels", specs: "12x12 inch, 86% cotton premium density, 300/case (25 dozen)", price: 5.02 },
  { id: "RDU-TWL-WCL-13X13-PRM", name: "Premium 13x13 Wash Cloths", cat: "Towels", specs: "13x13 inch, 86% cotton premium density, 300/case (25 dozen)", price: 8.07 },
  { id: "RDU-TWL-HTW-16X30-PRM", name: "Premium 16x30 Hand Towels", cat: "Towels", specs: "16x30 inch, 86% cotton premium density, 60/case (5 dozen)", price: 16.83 },
  { id: "RDU-TWL-BTW-24X48-PRM", name: "Premium 24x48 Bath Towels", cat: "Towels", specs: "24x48 inch, 86% cotton premium density, 60/case (5 dozen)", price: 33.48 },
  { id: "RDU-TWL-BTW-24X50-PRM", name: "Premium 24x50 Bath Towels", cat: "Towels", specs: "24x50 inch, 86% cotton premium density, 60/case (5 dozen)", price: 43.63 },
  { id: "RDU-TWL-BTW-27X54-PRM", name: "Premium 27x54 Bath Towels", cat: "Towels", specs: "27x54 inch, 86% cotton premium density, 60/case (5 dozen)", price: 58.86 },
  { id: "RDU-TWL-BMT-20X30-PRM", name: "Premium 20x30 Bath Mats", cat: "Towels", specs: "20x30 inch bath mat, 86% cotton premium density, 60/case (5 dozen)", price: 30.44 },
  { id: "RDU-TWL-WCL-13X13-LUX", name: "Luxury 13x13 Wash Cloths", cat: "Towels", specs: "13x13 inch, 100% ringspun cotton luxury cam border, 300/case (25 dozen)", price: 8.07 },
  { id: "RDU-TWL-HTW-16X30-LUX", name: "Luxury 16x30 Hand Towels", cat: "Towels", specs: "16x30 inch, 100% ringspun cotton luxury cam border, 120/case (10 dozen)", price: 22.32 },
  { id: "RDU-TWL-BTW-25X50-LUX", name: "Luxury 25x50 Bath Towels", cat: "Towels", specs: "25x50 inch, 100% ringspun cotton luxury cam border, 60/case (5 dozen)", price: 49.72 },
  { id: "RDU-TWL-BTW-27X54-LUX", name: "Luxury 27x54 Bath Towels", cat: "Towels", specs: "27x54 inch, 100% ringspun cotton luxury cam border, 60/case (5 dozen)", price: 65.96 },
  { id: "RDU-TWL-BMT-22X34-LUX", name: "Luxury 22x34 Bath Mats", cat: "Towels", specs: "22x34 inch bath mat, 100% ringspun cotton luxury cam border, 60/case (5 dozen)", price: 42.62 },
  // BED SHEETS - Microfiber
  { id: "RDU-BED-FLS-FXL-MF", name: "Microfiber Full XL Flat Sheet", cat: "Bed Sheets", specs: "Full XL flat sheet, 100% microfiber wrinkle-resistant, 24/case", price: 78.16 },
  { id: "RDU-BED-FTS-FXL-MF", name: "Microfiber Full XL Fitted Sheet", cat: "Bed Sheets", specs: "Full XL fitted sheet, 100% microfiber wrinkle-resistant, 24/case", price: 78.16 },
  { id: "RDU-BED-FLS-QN-MF", name: "Microfiber Queen Flat Sheet", cat: "Bed Sheets", specs: "Queen flat sheet, 100% microfiber wrinkle-resistant, 24/case", price: 84.25 },
  { id: "RDU-BED-FTS-QN-MF", name: "Microfiber Queen Fitted Sheet", cat: "Bed Sheets", specs: "Queen fitted sheet, 100% microfiber wrinkle-resistant, 24/case", price: 86.28 },
  { id: "RDU-BED-FLS-KG-MF", name: "Microfiber King Flat Sheet", cat: "Bed Sheets", specs: "King flat sheet, 100% microfiber wrinkle-resistant, 24/case", price: 91.30 },
  { id: "RDU-BED-FTS-KG-MF", name: "Microfiber King Fitted Sheet", cat: "Bed Sheets", specs: "King fitted sheet, 100% microfiber wrinkle-resistant, 24/case", price: 93.89 },
  // BED SHEETS - T-180
  { id: "RDU-BED-FLS-FXL-T180", name: "T-180 Full XL Flat Sheet", cat: "Bed Sheets", specs: "Full XL flat sheet, 180 thread count percale cotton-poly blend, 24/case", price: 78.16 },
  { id: "RDU-BED-FTS-FXL-T180", name: "T-180 Full XL Fitted Sheet", cat: "Bed Sheets", specs: "Full XL fitted sheet, 180 thread count percale cotton-poly blend, 24/case", price: 78.16 },
  { id: "RDU-BED-FLS-QN-T180", name: "T-180 Queen Flat Sheet", cat: "Bed Sheets", specs: "Queen flat sheet, 180 thread count percale cotton-poly blend, 24/case", price: 84.25 },
  { id: "RDU-BED-FTS-QN-T180", name: "T-180 Queen Fitted Sheet", cat: "Bed Sheets", specs: "Queen fitted sheet, 180 thread count percale cotton-poly blend, 24/case", price: 86.28 },
  { id: "RDU-BED-FLS-KG-T180", name: "T-180 King Flat Sheet", cat: "Bed Sheets", specs: "King flat sheet, 180 thread count percale cotton-poly blend, 24/case", price: 91.30 },
  { id: "RDU-BED-FTS-KG-T180", name: "T-180 King Fitted Sheet", cat: "Bed Sheets", specs: "King fitted sheet, 180 thread count percale cotton-poly blend, 24/case", price: 93.89 },
  // BED SHEETS - T-200
  { id: "RDU-BED-FLS-FXL-T200", name: "T-200 Full XL Flat Sheet", cat: "Bed Sheets", specs: "Full XL flat sheet, 200 thread count percale cotton-poly blend, 24/case", price: 106.52 },
  { id: "RDU-BED-FTS-FXL-T200", name: "T-200 Full XL Fitted Sheet", cat: "Bed Sheets", specs: "Full XL fitted sheet, 200 thread count percale cotton-poly blend, 24/case", price: 105.56 },
  { id: "RDU-BED-FLS-QN-T200", name: "T-200 Queen Flat Sheet", cat: "Bed Sheets", specs: "Queen flat sheet, 200 thread count percale cotton-poly blend, 24/case", price: 110.53 },
  { id: "RDU-BED-FTS-QN-T200", name: "T-200 Queen Fitted Sheet", cat: "Bed Sheets", specs: "Queen fitted sheet, 200 thread count percale cotton-poly blend, 24/case", price: 109.62 },
  { id: "RDU-BED-FLS-KG-T200", name: "T-200 King Flat Sheet", cat: "Bed Sheets", specs: "King flat sheet, 200 thread count percale cotton-poly blend, 24/case", price: 131.90 },
  { id: "RDU-BED-FTS-KG-T200", name: "T-200 King Fitted Sheet", cat: "Bed Sheets", specs: "King fitted sheet, 200 thread count percale cotton-poly blend, 24/case", price: 126.82 },
  // BED SHEETS - T-250
  { id: "RDU-BED-FLS-FXL-T250", name: "T-250 Full XL Flat Sheet", cat: "Bed Sheets", specs: "Full XL flat sheet, 250 thread count sateen cotton-poly blend, 24/case", price: 116.67 },
  { id: "RDU-BED-FTS-FXL-T250", name: "T-250 Full XL Fitted Sheet", cat: "Bed Sheets", specs: "Full XL fitted sheet, 250 thread count sateen cotton-poly blend, 24/case", price: 116.67 },
  { id: "RDU-BED-FLS-QN-T250", name: "T-250 Queen Flat Sheet", cat: "Bed Sheets", specs: "Queen flat sheet, 250 thread count sateen cotton-poly blend, 24/case", price: 136.97 },
  { id: "RDU-BED-FTS-QN-T250", name: "T-250 Queen Fitted Sheet", cat: "Bed Sheets", specs: "Queen fitted sheet, 250 thread count sateen cotton-poly blend, 24/case", price: 136.97 },
  { id: "RDU-BED-FLS-KG-T250", name: "T-250 King Flat Sheet", cat: "Bed Sheets", specs: "King flat sheet, 250 thread count sateen cotton-poly blend, 24/case", price: 152.20 },
  { id: "RDU-BED-FTS-KG-T250", name: "T-250 King Fitted Sheet", cat: "Bed Sheets", specs: "King fitted sheet, 250 thread count sateen cotton-poly blend, 24/case", price: 152.20 },
  // PILLOWS & PROTECTORS
  { id: "RDU-BED-MTP-FXL-WP", name: "Waterproof Full XL Mattress Protector", cat: "Pillows & Mattress Protectors", specs: "Full XL waterproof mattress protector, breathable, 10/case", price: 21.65 },
  { id: "RDU-BED-MTP-QN-WP", name: "Waterproof Queen Mattress Protector", cat: "Pillows & Mattress Protectors", specs: "Queen waterproof mattress protector, breathable, 10/case", price: 25.99 },
  { id: "RDU-BED-MTP-KG-WP", name: "Waterproof King Mattress Protector", cat: "Pillows & Mattress Protectors", specs: "King waterproof mattress protector, breathable, 10/case", price: 27.07 },
  { id: "RDU-BED-PIL-STD-STD", name: "Standard Pillow 20x26", cat: "Pillows & Mattress Protectors", specs: "20x26 standard hotel pillow, poly-fill, 12/case", price: 6.78 },
  { id: "RDU-BED-PIL-QN-STD", name: "Queen Pillow 20x30", cat: "Pillows & Mattress Protectors", specs: "20x30 queen hotel pillow, poly-fill, 8/case", price: 7.54 },
  { id: "RDU-BED-PIL-KG-STD", name: "King Pillow 21x37", cat: "Pillows & Mattress Protectors", specs: "21x37 king hotel pillow, poly-fill, 8/case", price: 9.71 },
  { id: "RDU-BED-PCS-STD-CTN", name: "Cotton-Poly Pillow Case", cat: "Pillows & Mattress Protectors", specs: "Standard pillow case, cotton-poly blend, 12/case", price: 21.65 },
  { id: "RDU-BED-PCS-STD-MF", name: "Microfiber Pillow Case", cat: "Pillows & Mattress Protectors", specs: "Standard pillow case, 100% microfiber, 12/case", price: 13.35 },
  { id: "RDU-BED-PPR-STD-T180", name: "T-180 Standard Pillow Protector", cat: "Pillows & Mattress Protectors", specs: "20x26 standard pillow protector, 180TC breathable fabric, 12/case", price: 21.65 },
  { id: "RDU-BED-PPR-STD-T200", name: "T-200 Standard Pillow Protector", cat: "Pillows & Mattress Protectors", specs: "20x26 standard pillow protector, 200TC refined weave, 12/case", price: 23.82 },
  { id: "RDU-BED-PPR-STD-WP", name: "Waterproof Pillow Protector", cat: "Pillows & Mattress Protectors", specs: "20x26 waterproof pillow protector, 100% waterproof membrane, 12/case", price: 30.27 },
  // BLANKETS & TOP SHEETS
  { id: "RDU-BED-BLK-FXL-FLC", name: "Fleece Blanket Full XL", cat: "Bed Sheets", specs: "Full XL plush fleece blanket, machine washable, 12/case", price: 16.23 },
  { id: "RDU-BED-BLK-QN-FLC", name: "Fleece Blanket Queen", cat: "Bed Sheets", specs: "Queen plush fleece blanket, machine washable, 12/case", price: 17.24 },
  { id: "RDU-BED-BLK-KG-FLC", name: "Fleece Blanket King", cat: "Bed Sheets", specs: "King plush fleece blanket, machine washable, 12/case", price: 18.26 },
  { id: "RDU-BED-TPS-FXL-BRN", name: "Full XL Top Sheet", cat: "Bed Sheets", specs: "Full XL top sheet, poly-cotton blend, each", price: 25.36 },
  { id: "RDU-BED-TPS-QN-BRN", name: "Queen Top Sheet", cat: "Bed Sheets", specs: "Queen top sheet, poly-cotton blend, each", price: 26.38 },
  { id: "RDU-BED-TPS-KG-BRN", name: "King Top Sheet", cat: "Bed Sheets", specs: "King top sheet, poly-cotton blend, each", price: 27.39 },
  // HOUSEKEEPING
  { id: "RDU-BTH-SHC-71X74-HKL", name: "Hookless Shower Curtain 71x74", cat: "Housekeeping Supplies", specs: "71x74 hookless shower curtain, water-resistant/mildew-resistant, 30/case", price: 14.09 },
  // TRASH / ICE LINERS
  { id: "RDU-LNR-ICE-3GAL-ICE12", name: "3 Gallon Ice Liner 12x12", cat: "Trash Liners", specs: "12x12 ice bucket liner, food-safe plastic, 1000/case", price: 13.18 },
  { id: "RDU-LNR-ICE-3GAL-ICE13", name: "3 Gallon Ice Liner 13x13", cat: "Trash Liners", specs: "13x13 ice bucket liner, food-safe plastic, 1000/case", price: 13.18 },
  // GUEST AMENITIES
  { id: "RDU-AMN-SOP-15G-STD", name: "Hotel Soap Bar 15g", cat: "Guest Amenities", specs: "15g individually wrapped hotel soap, 1000/case", price: 64.20 },
  { id: "RDU-AMN-SHM-30ML-STD", name: "Hotel Shampoo 30mL", cat: "Guest Amenities", specs: "30mL hotel shampoo bottle, 216/case", price: 59.44 },
  { id: "RDU-AMN-CON-30ML-STD", name: "Hotel Conditioner 30mL", cat: "Guest Amenities", specs: "30mL hotel conditioner bottle, 216/case", price: 59.44 },
  { id: "RDU-AMN-BDW-30ML-STD", name: "Hotel Body Wash 30mL", cat: "Guest Amenities", specs: "30mL hotel body wash bottle, 216/case", price: 59.44 },
  { id: "RDU-AMN-LOT-30ML-STD", name: "Hotel Lotion 30mL", cat: "Guest Amenities", specs: "30mL hotel lotion bottle, 216/case", price: 59.44 },
  // FURNITURE
  { id: "RDU-FUR-PBF-FXL-T1", name: "Platform Bed Frame Full XL", cat: "Furniture", specs: "54x80x16 inch Full XL platform bed frame, durable metal, no box spring needed", price: null },
  { id: "RDU-FUR-PBF-QN-T1", name: "Platform Bed Frame Queen", cat: "Furniture", specs: "60x80x16 inch Queen platform bed frame, durable metal, no box spring needed", price: null },
  { id: "RDU-FUR-PBF-KG-T1", name: "Platform Bed Frame King", cat: "Furniture", specs: "76x80x16 inch King platform bed frame, durable metal, no box spring needed", price: null },
  { id: "RDU-BED-MAT-FXL-GH", name: "Grand Haven Full XL Hotel Mattress", cat: "Furniture", specs: "Full XL commercial hotel mattress, 720-count pocket coil, Ice Touch cover", price: 215.27 },
  { id: "RDU-BED-MAT-QN-GH", name: "Grand Haven Queen Hotel Mattress", cat: "Furniture", specs: "Queen commercial hotel mattress, 720-count pocket coil, Ice Touch cover", price: 215.27 },
  { id: "RDU-BED-MAT-KG-GH", name: "Grand Haven King Hotel Mattress", cat: "Furniture", specs: "King commercial hotel mattress, 720-count pocket coil, Ice Touch cover", price: 323.07 },
  // CLEANING CHEMICALS
  { id: "11008635042", name: "Pure Bright Germicidal Ultra Bleach 128oz", cat: "Cleaning Chemicals", specs: "128oz 6% sodium hypochlorite bleach, EPA registered disinfectant, kills C. diff, 6/case", price: 34.06 },
  { id: "74828", name: "Professional Lysol Disinfectant Spray 19oz", cat: "Cleaning Chemicals", specs: "19oz Lysol aerosol disinfectant spray, kills cold/flu viruses, hospital-grade, 12/case", price: 143.58 },
  { id: "68970", name: "Clorox Healthcare Bleach Germicidal Cleaner 32oz", cat: "Cleaning Chemicals", specs: "32oz Clorox bleach germicidal cleaner, kills C. diff and C. auris, 6/case", price: 94.11 },
  { id: "31547", name: "CloroxPro Disinfecting Wipes 700ct", cat: "Cleaning Chemicals", specs: "700ct Clorox bleach-free disinfecting wipes, kills 99.9% germs", price: 59.54 },
  { id: "P22884", name: "Sani Professional Disinfecting Multi-Surface Wipes 200ct", cat: "Cleaning Chemicals", specs: "200ct quaternary ammonium wipes, kills 99.9% bacteria in 15 sec, 6/case", price: 66.77 },
  { id: "438-5155", name: "Champion Sprayon Vista Cleer Glass Cleaner 20oz", cat: "Cleaning Chemicals", specs: "20oz ammonia-free foaming glass cleaner, streak-free, 12/case", price: 53.82 },
  { id: "P050", name: "Performance Plus Foaming Glass Cleaner 19oz", cat: "Cleaning Chemicals", specs: "19oz denatured alcohol foaming glass cleaner, no ammonia, 12/case", price: 49.03 },
  { id: "316147", name: "Windex Glass Cleaner Refill 67.6oz", cat: "Cleaning Chemicals", specs: "67.6oz Windex blue glass cleaner liquid refill, 6/case", price: 59.09 },
  { id: "313042", name: "Windex Original Trigger Sprayer 23oz", cat: "Cleaning Chemicals", specs: "23oz Windex ready-to-use trigger sprayer, streak-free, 8/case", price: 49.60 },
  { id: "PP40PAIL", name: "Performance Plus Low Suds Powder Laundry Detergent 40lb", cat: "Cleaning Chemicals", specs: "40lb powder laundry detergent, HE compatible, commercial grade", price: 32.87 },
  { id: "5016", name: "Purex Mountain Breeze Liquid Laundry Detergent 150oz", cat: "Cleaning Chemicals", specs: "150oz Purex liquid laundry detergent, 115 loads, 4/case", price: 77.76 },
  { id: "60607", name: "CloroxPro Pine-Sol Multi-Surface Cleaner 80oz", cat: "Cleaning Chemicals", specs: "80oz Pine-Sol 2X concentrated cleaner, kills 99.9% germs, makes 80 gallons, 3/case", price: 55.55 },
  { id: "97330", name: "Finish Powerball Deep Clean Dishwashing Tabs 94ct", cat: "Cleaning Chemicals", specs: "94ct Finish dishwasher tabs, oxygen-based bleach, 4/case", price: 132.61 },
  { id: "70681", name: "Dawn Professional Pot & Pan Dish Soap 5 Gallon", cat: "Cleaning Chemicals", specs: "5 gallon Dawn professional grease-cutting dish soap, fills 512 sinks", price: 134.05 },
  // TRASH LINERS
  { id: "PL385815B", name: "Performance Plus Low Density Can Liners 38x58", cat: "Trash Liners", specs: "38x58 low-density LDPE can liners, superior stretch, 10/10 rolls per case", price: 35.48 },
  { id: "S243308N", name: "Inteplast HDPE Institutional Trash Liners 24x33", cat: "Trash Liners", specs: "24x33 high-density HDPE trash liners, star seal, 20 rolls/50 per case", price: 46.81 },
  { id: "RM3858H", name: "NAPCO Heavy Duty Municipal Liners 38x58", cat: "Trash Liners", specs: "38x58 heavy-duty recycled resin liners, municipal grade, 5/20 per case", price: 37.64 },
  { id: "NOVA519", name: "Nova Black Repro Can Liners 38x58 light", cat: "Trash Liners", specs: "38x58 black recycled resin liners 70% recycled content, 100/case", price: 49.08 },
  { id: "NOVA523", name: "Nova Black Repro Can Liners 38x58 heavy", cat: "Trash Liners", specs: "38x58 heavy black recycled resin liners 70% recycled content, 100/case", price: 36.92 },
  { id: "NOVA517", name: "Nova Black Repro Can Liners 40x46", cat: "Trash Liners", specs: "40x46 black recycled resin liners 70% recycled content, 100/case", price: 30.87 },
  { id: "NOVA522", name: "Nova Black Repro Can Liners 43x47", cat: "Trash Liners", specs: "43x47 black recycled resin liners 70% recycled content, 100/case", price: 45.02 },
  // PAPER PRODUCTS
  { id: "276", name: "Green Heritage Pro 2-Ply Bathroom Tissue 500 sheets", cat: "Paper Products", specs: "2-ply bathroom tissue 500 sheets/roll, SFI certified septic-safe, 96 rolls/case", price: 49.95 },
  { id: "248", name: "Green Heritage Pro 2-Ply Bathroom Tissue 400 sheets", cat: "Paper Products", specs: "2-ply bathroom tissue 400 sheets/roll, SFI certified septic-safe, 96 rolls/case", price: 44.55 },
  { id: "FT 30852", name: "Empress 2-Ply Facial Tissue 85ct Cube Box", cat: "Paper Products", specs: "85 count 2-ply facial tissue in cube box, 7.75x7.5 sheet, 36/case", price: 32.31 },
  { id: "FT 301002", name: "Empress Virgin 2-Ply Facial Tissue 100ct", cat: "Paper Products", specs: "100 count virgin fiber 2-ply facial tissue, 30/case", price: 23.99 },
  { id: "11516", name: "Livi VPG Select Cube Box Facial Tissue 90ct", cat: "Paper Products", specs: "90 count 2-ply virgin fiber facial tissue cube box, 36/case", price: 38.11 },
  { id: "11513", name: "Livi VPG Select Flat Box Facial Tissue 100ct", cat: "Paper Products", specs: "100 count 2-ply virgin fiber facial tissue flat box, 30/case", price: 31.66 },
  { id: "CP 660010", name: "Empress 2-Ply Center Pull Virgin Paper Towel", cat: "Paper Products", specs: "7.6x8.9 inch 2-ply center pull virgin fiber paper towel, 6 rolls/case", price: 33.47 },
  { id: "410081", name: "Sofidel Double Layer Center Pull Towel 500ft", cat: "Paper Products", specs: "500ft embossed 2-ply center pull paper towel, virgin pulp, 600 towels/roll, 6/case", price: 34.51 },
  { id: "585", name: "Green Heritage Pro Kitchen Roll Towel 85ct", cat: "Paper Products", specs: "85 count 2-ply recycled fiber kitchen roll paper towel, SFI certified, 30/case", price: 34.17 },
  { id: "NOVA 3085", name: "Nova 2-Ply Kitchen Roll Towel 85ct", cat: "Paper Products", specs: "85 count 2-ply kitchen roll paper towel, 30/case", price: 34.87 },
  { id: "R720", name: "Morcon Morsoft Multifold Paper Towel", cat: "Paper Products", specs: "9.05x9.25 inch multifold paper towel, post-consumer content, 16 packs of 250 per case", price: 28.92 },
  { id: "VT1106", name: "Morcon Valay Multifold Paper Towel", cat: "Paper Products", specs: "9.05x9.25 inch premium multifold paper towel, post-consumer content, 16 packs of 250 per case", price: 32.75 },
  { id: "NOVA 350N", name: "Nova Hardwound Towel 8x350ft Natural", cat: "Paper Products", specs: "8 inch wide x 350 foot hardwound roll paper towel natural, 12/case", price: 26.92 },
  { id: "NOVA 800N", name: "Nova Hardwound Towel 8x800ft Natural", cat: "Paper Products", specs: "8 inch wide x 800 foot hardwound roll paper towel natural, 6/case", price: 34.43 },
  { id: "NOVA 350W", name: "Nova Hardwound Towel 8x350ft White", cat: "Paper Products", specs: "8 inch wide x 350 foot hardwound roll paper towel white, 6/case", price: 29.24 },
  { id: "NOVA 800W", name: "Nova Hardwound Towel 8x800ft White", cat: "Paper Products", specs: "8 inch wide x 800 foot hardwound roll paper towel white, 6/case", price: 35.90 },
  // GLOVES
  { id: "ENPFS2001", name: "Empress Blue Nitrile Gloves Small", cat: "Gloves & PPE", specs: "Small blue nitrile powder-free gloves, 10 boxes of 100 per case", price: 43.47 },
  { id: "ENPFM2002", name: "Empress Blue Nitrile Gloves Medium", cat: "Gloves & PPE", specs: "Medium blue nitrile powder-free gloves, 10 boxes of 100 per case", price: 43.47 },
  { id: "ENPFL2003", name: "Empress Blue Nitrile Gloves Large", cat: "Gloves & PPE", specs: "Large blue nitrile powder-free gloves, 10 boxes of 100 per case", price: 43.47 },
  { id: "ENPFXL2004", name: "Empress Blue Nitrile Gloves XL", cat: "Gloves & PPE", specs: "XL blue nitrile powder-free gloves, 10 boxes of 100 per case", price: 43.47 },
  { id: "ENES2001", name: "Empress Exam Grade Nitrile Gloves Small", cat: "Gloves & PPE", specs: "Small exam-grade blue nitrile powder-free gloves, 10 boxes of 100 per case", price: 45.18 },
  { id: "ENEM2002", name: "Empress Exam Grade Nitrile Gloves Medium", cat: "Gloves & PPE", specs: "Medium exam-grade blue nitrile powder-free gloves, 10 boxes of 100 per case", price: 45.18 },
  { id: "ENEL2003", name: "Empress Exam Grade Nitrile Gloves Large", cat: "Gloves & PPE", specs: "Large exam-grade blue nitrile powder-free gloves, 10 boxes of 100 per case", price: 45.18 },
  { id: "ENEXL2004", name: "Empress Exam Grade Nitrile Gloves XL", cat: "Gloves & PPE", specs: "XL exam-grade blue nitrile powder-free gloves, 10 boxes of 100 per case", price: 45.18 },
  // HOUSEKEEPING SUPPLIES
  { id: "88047", name: "Dial Gold Antimicrobial Liquid Hand Soap Gallon", cat: "Housekeeping Supplies", specs: "1 gallon Dial Gold antimicrobial hand soap, kills 99.9% germs, dermatologist tested, 4/case", price: 102.11 },
  { id: "PP-28130", name: "Performance Plus White Lotion Skin Cleanser Gallon", cat: "Housekeeping Supplies", specs: "1 gallon white lotion skin cleanser with emollients, almond fragrance, 4/case", price: 47.97 },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured in Supabase secrets");

    const { file_url, file_name } = await req.json();
    if (!file_url) throw new Error("file_url is required");

    // Determine media type from extension
    const ext = (file_name || file_url).split(".").pop()?.toLowerCase() ?? "";
    const isPdf = ext === "pdf";
    const mediaType = isPdf ? "application/pdf"
      : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : "image/png";

    // Fetch file and encode as base64
    const fileRes = await fetch(file_url);
    if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileRes.status}`);
    const buffer = await fileRes.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64Data = btoa(binary);

    // Build compact catalog text for the prompt
    const catalogText = CATALOG
      .map(p => `${p.id} | ${p.name} | [${p.cat}] | ${p.specs}${p.price != null ? ` | $${p.price}/case` : " | price on request"}`)
      .join("\n");

    // Build Gemini inline data part
    const inlinePart = {
      inline_data: { mime_type: mediaType, data: base64Data }
    };

    const systemPrompt = `You are an expert hospitality supply procurement specialist. Your job is to:
1. Extract all line items from a competitor's supply quote
2. Match each item to the best equivalent product in the RRS catalog

RRS PRODUCT CATALOG:
${catalogText}

MATCHING RULES:
- Match by product TYPE and SPECS, not brand name (e.g., "Scott 2-ply tissue" matches our Green Heritage Pro 2-ply tissue)
- For towels: match by type (wash cloth/hand/bath/mat) AND closest available size
- For sheets: match by size (Full XL/Queen/King) AND closest thread count tier
- For trash liners: match by dimensions AND density type
- For paper products: match by product type AND sheet/roll count
- confidence = "high" means essentially the same product, "medium" means similar with minor differences, "low" means best available guess
- Only put in "unmatched" if there is truly NO relevant product in the catalog

Return ONLY valid JSON with no extra text:
{
  "supplier_name": "name of the supplier/competitor shown on the quote",
  "total_items_found": 0,
  "matches": [
    {
      "line_item": "exact description from quote",
      "competitor_qty": 1,
      "competitor_unit_price": 0.00,
      "rrs_id": "product ID from catalog",
      "rrs_name": "product name from catalog",
      "rrs_price": 0.00,
      "confidence": "high",
      "match_reason": "brief note on why this matches"
    }
  ],
  "unmatched": [
    {
      "line_item": "exact description from quote",
      "competitor_qty": 1,
      "competitor_unit_price": 0.00,
      "reason": "why no match exists"
    }
  ]
}`;

    // Try models in order until one works
    const MODELS = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-002",
      "gemini-1.5-pro",
      "gemini-2.0-flash-lite",
      "gemini-2.0-flash-exp",
    ];

    let geminiRes: Response | null = null;
    let lastErr = "";
    for (const model of MODELS) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: systemPrompt + "\n\nPlease analyze this competitor quote and match all products to the RRS catalog. Return only the JSON response." },
                inlinePart,
              ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
          })
        }
      );
      if (r.ok) { geminiRes = r; break; }
      const errBody = await r.json().catch(() => ({}));
      lastErr = (errBody as any).error?.message ?? `HTTP ${r.status}`;
      // quota exceeded = model exists but no free tier, skip
      // not found = try next model
    }

    if (!geminiRes) throw new Error(`No available Gemini model found. Last error: ${lastErr}`);

    const geminiData = await geminiRes.json();
    const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI returned invalid response format");

    const result = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[match-competitor-quote] error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
