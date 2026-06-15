import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "How It Works | Room Ready Supply",
  description: "Learn how Room Ready Supply makes ordering hospitality supplies simple and hassle-free.",
};

const STEPS = [
  {
    num: 1,
    title: "Browse the Catalog",
    desc: "Explore our full catalog of commercial-grade hospitality and facility supplies. Filter by category and find exactly what your business needs.",
  },
  {
    num: 2,
    title: "Request Business Pricing",
    desc: "Fill out our simple business pricing request form. We'll review your needs and send you a custom quote within one business day.",
  },
  {
    num: 3,
    title: "Place Your Order",
    desc: "Once you have your pricing, place your order online or by phone. We accept major payment methods and purchase orders.",
  },
  {
    num: 4,
    title: "Set Up Auto-Reorder",
    desc: "Never run out of supplies again. Set a recurring delivery schedule — weekly, bi-weekly, or monthly — and we handle the rest.",
  },
];

const WHY = [
  { icon: "🏨", title: "Built for Hospitality", desc: "Products specifically selected for hotels, motels, short-term rentals, and cleaning companies." },
  { icon: "💰", title: "Case-Price Savings", desc: "Bulk pricing that brings your per-unit cost down significantly compared to retail." },
  { icon: "🔄", title: "Automated Reorders", desc: "Set it and forget it — we deliver on your schedule so you always stay stocked." },
  { icon: "📞", title: "Local Support", desc: "Real people who understand your business and respond quickly when you need help." },
];

export default function HowItWorksPage() {
  return (
    <>
      <TopBar />
      <Navbar />
      <div className="page-header-block">
        <h1 className="ph-title">How It Works</h1>
        <div className="ph-line" />
        <p className="ph-sub">Getting the supplies your business needs is simple. Here's how.</p>
      </div>

      <section className="hiw-steps-section">
        <div className="hiw-steps-grid">
          {STEPS.map((s) => (
            <div className="hiw-step-card" key={s.num}>
              <div className="hiw-step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="hiw-why-section">
        <div className="hiw-why-inner">
          <h2>Why Businesses Choose Us</h2>
          <div className="ph-line" style={{ margin: "12px auto 40px" }} />
          <div className="hiw-why-grid">
            {WHY.map((w) => (
              <div className="hiw-why-card" key={w.title}>
                <div className="hiw-why-icon" aria-hidden="true">{w.icon}</div>
                <h3>{w.title}</h3>
                <p>{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="hiw-cta">
        <h2>Ready to Get Started?</h2>
        <p>Join dozens of local businesses who trust Room Ready Supply.</p>
        <div style={{ display: "flex", gap: "24px", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/catalog" className="btn-primary">Browse Catalog</a>
          <a href="/business-pricing" className="btn-secondary">Request Pricing</a>
        </div>
      </section>

      <Footer />
    </>
  );
}
