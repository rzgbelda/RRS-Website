import Link from "next/link";
import Image from "next/image";
import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const featuredProducts = [
  { name: "Premium Hospitality Blanket", img: "/assets/blanket.png", desc: "Commercial Grade Comfort", caseQty: 6, packSize: 1, price: "34.99" },
  { name: "Premium Hospitality Blanket", img: "/assets/blanket.png", desc: "Commercial Grade Comfort", caseQty: 6, packSize: 1, price: "34.99" },
  { name: "Premium Hospitality Blanket", img: "/assets/blanket.png", desc: "Commercial Grade Comfort", caseQty: 6, packSize: 1, price: "34.99" },
  { name: "Premium Hospitality Blanket", img: "/assets/blanket.png", desc: "Commercial Grade Comfort", caseQty: 6, packSize: 1, price: "34.99" },
];

const customerTypes = [
  { name: "Hotels", img: "/assets/Hotel.png" },
  { name: "Motels", img: "/assets/Motel.png" },
  { name: "Short-Term Rentals", img: "/assets/ShortTermRental.png" },
  { name: "Cleaning Companies", img: "/assets/CleaningCompany.png" },
  { name: "Restaurants", img: "/assets/Restaurant.png" },
  { name: "Campgrounds", img: "/assets/Campgrounds.png" },
  { name: "RV Parks", img: "/assets/RV.png" },
  { name: "Facilities", img: "/assets/Facilities.png" },
];

const steps = [
  { icon: "⌕", label: "1. Browse", desc: "Explore products by category." },
  { icon: "🛒", label: "2. Select", desc: "Add items and quantities to your order." },
  { icon: "📋", label: "3. Submit", desc: "Send your order request with delivery details." },
  { icon: "✓", label: "4. Confirm", desc: "We confirm pricing, availability, and delivery." },
  { icon: "🚚", label: "5. Reorder", desc: "Set a reminder or recurring schedule." },
];

const features = [
  {
    img: "/assets/au1.svg",
    title: "Everyday Essentials",
    desc: "Quality products for hospitality, rentals, cleaning teams, restaurants, and facilities.",
  },
  {
    img: "/assets/au2.svg",
    title: "Simple Business Ordering",
    desc: "Organized ordering designed for recurring purchases and repeat supply management.",
  },
  {
    img: "/assets/au3.svg",
    title: "Reorder Made Easy",
    desc: "Set reorder reminders or recurring schedules with approval before processing.",
  },
];

export default function HomePage() {
  return (
    <>
      <TopBar />
      <Navbar />

      {/* HERO */}
      <section className="hero">
        <div className="hero-content">
          <h1>
            Keep Your
            <br />
            Rooms Ready
            <br />
            <span>Without Chasing Supplies</span>
          </h1>
          <p>
            Room Ready Supply helps hotels, motels, short-term rentals, cleaning companies,
            and facilities order the everyday supplies they need with simple pricing, easy
            reordering, and local support.
          </p>
          <div className="hero-buttons">
            <Link href="/catalog" className="btn-primary">
              <Image src="/assets/cart.svg" alt="" width={18} height={18} style={{ filter: "brightness(0) invert(1)" }} />
              Shop Catalog
            </Link>
            <Link href="/business-pricing" className="btn-secondary">
              <Image src="/assets/file-list-3-line.svg" alt="" width={18} height={18} style={{ filter: "invert(55%) sepia(78%) saturate(1713%) hue-rotate(347deg) brightness(98%) contrast(90%)" }} />
              Request Business Pricing
            </Link>
          </div>
        </div>
        <div className="hero-image">
          <Image
            src="/assets/banner1.png"
            alt="Room Ready Supply — hospitality essentials"
            width={1080}
            height={550}
            style={{ width: "100%", height: "550px", objectFit: "cover", borderRadius: "8px" }}
            priority
          />
        </div>
      </section>

      {/* WHAT WE SUPPLY */}
      <section className="supply-section">
        <h2>What We Supply</h2>
        <div className="underline" />
        <p>Everyday hospitality and facility essentials.</p>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="product-section">
        <button className="arrow left-arrow">‹</button>
        <div className="product-grid">
          {featuredProducts.map((p) => (
            <div className="product-card" key={p.name}>
              <Link href="/catalog">
                <Image
                  src={p.img}
                  alt={p.name}
                  width={241}
                  height={150}
                  style={{ width: "100%", height: "150px", objectFit: "contain", background: "#f3f3f3", borderRadius: "4px", marginBottom: "14px" }}
                />
              </Link>
              <h3 className="product-name">{p.name}</h3>
              <p className="product-description">{p.desc}</p>
              <div className="product-meta">
                <div className="meta-item">
                  <Image src="/assets/box.svg" alt="Case Qty" width={14} height={14} />
                  <span>Case Qty: {p.caseQty}</span>
                </div>
                <div className="meta-item">
                  <Image src="/assets/pack.svg" alt="Pack Size" width={14} height={14} />
                  <span>Pack Size: {p.packSize}</span>
                </div>
              </div>
              <div className="stock-status">
                <span className="dot" />
                In Stock
              </div>
              <div className="feat-price">
                ${p.price} <span>/Case</span>
              </div>
              <button className="add-btn">
                <Image src="/assets/cart.svg" alt="" width={15} height={15} />
                ADD TO CART
              </button>
            </div>
          ))}
        </div>
        <button className="arrow right-arrow">›</button>
        <Link href="/catalog" className="view-more">
          View More &gt;&gt;
        </Link>
      </section>

      {/* WHO WE SERVE */}
      <section className="serve-section">
        <h2>Who We Serve</h2>
        <div className="underline" />
      </section>
      <section className="customer-types">
        <div className="customer-card">
          {customerTypes.map((c) => (
            <div className="customer-item" key={c.name}>
              <Image src={c.img} alt={c.name} width={100} height={85} />
              <span>{c.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* HOW ORDERING WORKS + REORDER PROGRAM */}
      <section className="ordering-section" id="how-it-works">
        <div className="ordering-left">
          <h2>How Ordering Works</h2>
          <div className="steps-row">
            {steps.map((s, i) => (
              <>
                <div className="step" key={s.label}>
                  <div className="step-icon">{s.icon}</div>
                  <h3>{s.label}</h3>
                  <p>{s.desc}</p>
                </div>
                {i < steps.length - 1 && (
                  <div className="step-arrow" key={`arrow-${i}`}>→</div>
                )}
              </>
            ))}
          </div>
        </div>

        <div className="reorder-card" id="reorder-program">
          <h2>Reorder Program</h2>
          <p>Build your supply list and choose a reminder or recurring schedule.</p>
          <div className="schedule-grid">
            <div>✓ Weekly</div>
            <div>✓ Every 45 Days</div>
            <div>✓ Every 2 Weeks</div>
            <div>✓ Every 60 Days</div>
            <div>✓ Monthly</div>
            <div>✓ Custom Schedule</div>
          </div>
          <Link href="/auto-reorder" className="schedule-btn">
            ⏰ SCHEDULE NOW!
          </Link>
        </div>
      </section>

      {/* BUSINESS PRICING SECTION */}
      <section className="pricing-request-section" id="business-pricing">
        <div className="pricing-wrapper">
          <div className="pricing-form-area">
            <h2>Request Business Pricing</h2>
            <div className="pricing-title-line" />
            <p className="pricing-intro">
              Let us quote the products you already buy. Send your current supply list,
              invoice, or estimated monthly usage and we will help review available options.
            </p>

            <div className="pricing-benefits">
              <div className="benefit-item">
                <span className="benefit-icon">
                  <Image src="/assets/bsp1.svg" alt="Pricing" width={36} height={36} />
                </span>
                <strong>Competitive<br />Case Pricing</strong>
              </div>
              <div className="benefit-item">
                <span className="benefit-icon">
                  <Image src="/assets/bsp2.svg" alt="Products" width={36} height={36} />
                </span>
                <strong>Hospitality<br />Focused Products</strong>
              </div>
              <div className="benefit-item">
                <span className="benefit-icon">
                  <Image src="/assets/bsp3.svg" alt="Support" width={36} height={36} />
                </span>
                <strong>Local<br />Support</strong>
              </div>
              <div className="benefit-item">
                <span className="benefit-icon">
                  <Image src="/assets/bsp4.svg" alt="Reorder" width={36} height={36} />
                </span>
                <strong>Easy Reorder<br />Program</strong>
              </div>
            </div>

            <form className="business-form" action="/business-pricing">
              <div className="form-columns">
                <div className="form-column">
                  <h3>Business Information</h3>
                  <label>Business Name</label>
                  <input type="text" placeholder="Enter business name" />
                  <label>Customer Type</label>
                  <input type="text" placeholder="Enter customer type" />
                  <label>Contact Name</label>
                  <input type="text" placeholder="Enter contact name" />
                  <label>Email</label>
                  <input type="email" placeholder="Enter email address" />
                </div>
                <div className="form-column">
                  <h3>Supply Information</h3>
                  <label>Current Supplier (if known)</label>
                  <input type="text" placeholder="Enter current supplier" />
                  <label>Regular Products You Buy</label>
                  <input type="text" placeholder="e.g., paper products, cleaning supplies" />
                  <label>Estimated Monthly Usage</label>
                  <input type="text" placeholder="e.g., $500–$1,000" />
                  <label>Upload Current Invoice / Sample Order</label>
                  <label className="upload-box">
                    <div style={{ marginBottom: "4px" }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z"
                          stroke="#F26F21"
                          strokeWidth="2"
                        />
                        <path d="M14 2V8H20" stroke="#F26F21" strokeWidth="2" />
                        <path d="M12 18V12" stroke="#F26F21" strokeWidth="2" />
                        <path d="M9.5 14.5L12 12L14.5 14.5" stroke="#F26F21" strokeWidth="2" />
                      </svg>
                    </div>
                    <strong>Drag &amp; drop your file here</strong>
                    <span style={{ fontSize: "13px", color: "#666" }}>or browse to upload</span>
                    <small style={{ color: "#aaa" }}>PDF, JPG, PNG (Max 10MB)</small>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} />
                  </label>
                </div>
              </div>

              <div className="notes-area">
                <label>
                  Additional Notes
                  <br />
                  <span>(delivery location, recurring supplies, etc.)</span>
                </label>
                <textarea placeholder="Tell us anything else that will help us quote your business" />
              </div>

              <button type="submit" className="quote-btn">
                Get My Business Quote
              </button>
            </form>
          </div>

          <div className="pricing-image">
            <Image
              src="/assets/banner4.png"
              alt="Business pricing — hotel supplies"
              width={700}
              height={470}
              style={{ width: "100%", height: "470px", objectFit: "cover" }}
            />
          </div>
        </div>
      </section>

      {/* ABOUT US */}
      <section className="about-section" id="about-us">
        <div className="about-top">
          <div className="about-content">
            <span className="about-label">ABOUT US</span>
            <div className="about-line" />
            <h2>
              We Help Operators
              <br />
              Stay Ready
            </h2>
            <div className="about-line large" />
            <p>
              Keeping rooms, rentals, kitchens, and facilities ready takes more than just
              products — it takes a supply partner that understands repeat ordering.
            </p>
            <p>
              Room Ready Supply provides hospitality and facility essentials such as paper
              products, trash liners, cleaning supplies, soaps, laundry items, dishwashing
              products, guest room supplies, linens, food service supplies, and facility
              essentials.
            </p>
            <p>
              Our goal is simple: help businesses stop chasing supplies and start using a
              clear, organized reorder system.
            </p>
          </div>
          <div className="about-image">
            <Image
              src="/assets/banner3.png"
              alt="Room Ready Supply operations"
              width={700}
              height={520}
              style={{ width: "100%", height: "520px", objectFit: "cover" }}
            />
          </div>
        </div>

        <div className="about-features">
          {features.map((f) => (
            <div className="feature-card" key={f.title}>
              <Image src={f.img} alt={f.title} width={80} height={80} />
              <div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}
