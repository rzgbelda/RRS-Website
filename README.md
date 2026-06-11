# Room Ready Supply — B2B Hospitality Supply Ordering Platform

Built with Next.js 15, TypeScript, Tailwind CSS, and Supabase.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Hosting**: Vercel
- **Repo**: GitHub

---

## Pages

| Route | Page |
|---|---|
| `/` | Homepage (Hero, Supply, Serve, How It Works, Reorder, Pricing, About) |
| `/catalog` | Product Catalog with category filter |
| `/catalog/[id]` | Product Detail |
| `/order` | Order Request Form |
| `/business-pricing` | Business Pricing / Quote Request |
| `/auto-reorder` | Auto-Reorder Setup |
| `/dashboard` | Customer Dashboard |
| `/admin` | Admin Overview |
| `/admin/products` | Product Management |
| `/admin/orders` | Order Management |
| `/admin/quotes` | Quote Management |
| `/admin/customers` | Customer Management |

---

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/your-org/rr-supplies.git
cd rr-supplies
npm install
```

### 2. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → run `supabase/migrations/001_initial_schema.sql`
3. Set up **Storage buckets**:
   - `product-images` (public)
   - `invoices` (private)
4. Copy your project URL and anon key

### 3. Environment Variables

```bash
cp .env.local.example .env.local
# Fill in your Supabase values
```

### 4. Run Locally

```bash
npm run dev
# Opens at http://localhost:3000
```

### 5. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY
```

---

## Assets

All brand assets are in `/public/assets/`:
- `banner1.png` — Hero image
- `banner3.png` — About Us image
- `banner4.png` — Business Pricing image
- `Hotel.png`, `Motel.png`, etc. — Who We Serve customer types
- `au1.svg`, `au2.svg`, `au3.svg` — About Us feature icons
- `bsp1.svg`–`bsp5.svg` — Business pricing benefit icons
- `sampleitem.svg` — Product placeholder

---

## Supabase Storage Buckets

Create these buckets in your Supabase dashboard:

```
product-images  → Public  → for product photos
invoices        → Private → for uploaded customer invoices
```

---

## Brand Colors

| Color | Hex |
|---|---|
| Orange (primary action) | `#f26f21` |
| Navy Blue (headings) | `#28476a` |
| Dark Navy (sections) | `#0f2b50` |
| Deep Navy (about/footer) | `#0f2b57` |

---

## Future Enhancements

- [ ] Supabase Auth integration (customer login/signup)
- [ ] Real product image uploads via Supabase Storage
- [ ] Email notifications via Resend or Supabase Edge Functions
- [ ] CRM integration (HubSpot / Salesforce)
- [ ] SMS reorder reminders via Twilio
- [ ] Full checkout with Stripe
- [ ] Mobile app
