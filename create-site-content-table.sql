-- Run this in Supabase SQL Editor once
-- Creates the site_content table for Hero & About section CMS

CREATE TABLE IF NOT EXISTS site_content (
  section TEXT PRIMARY KEY,
  content JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow public reads (so the homepage can fetch content)
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read site_content"
  ON site_content FOR SELECT
  USING (true);

-- Only authenticated users (admin) can write
CREATE POLICY "Auth users can upsert site_content"
  ON site_content FOR ALL
  USING (auth.role() = 'authenticated');

-- Seed default hero content
INSERT INTO site_content (section, content) VALUES (
  'hero',
  '{
    "heading": "Keep Your|Rooms Ready|Without Chasing Supplies",
    "highlight": "Without Chasing Supplies",
    "description": "Room Ready Supply helps hotels, motels, short-term rentals, cleaning companies, and facilities order the everyday supplies they need with simple pricing, easy reordering, and local support.",
    "btnPrimary": "Shop Catalog",
    "btnSecondary": "Request Business Pricing",
    "bannerUrl": "banner1.png"
  }'
) ON CONFLICT (section) DO NOTHING;

-- Seed default about content
INSERT INTO site_content (section, content) VALUES (
  'about',
  '{
    "tag": "ABOUT US",
    "title": "We Help Operators Stay Ready",
    "p1": "Keeping rooms, rentals, kitchens, and facilities ready takes more than just products — it takes a supply partner that understands repeat ordering.",
    "p2": "Room Ready Supply provides hospitality and facility essentials such as paper products, trash liners, cleaning supplies, soaps, laundry items, dishwashing products, guest room supplies, linens, food service supplies, and facility essentials.",
    "p3": "Our goal is simple: help businesses stop chasing supplies and start using a clear, organized reorder system.",
    "bannerUrl": "banner3.png",
    "features": [
      {"icon": "au1.svg", "title": "Everyday Essentials", "desc": "Quality products for hospitality, rentals, cleaning teams, restaurants, and facilities."},
      {"icon": "au2.svg", "title": "Simple Business Ordering", "desc": "Everyday essentials and simple ordering support for repeat buyers."},
      {"icon": "au3.svg", "title": "Reorder Made Easy", "desc": "Set reorder reminders or recurring schedules with approval before processing."}
    ]
  }'
) ON CONFLICT (section) DO NOTHING;
