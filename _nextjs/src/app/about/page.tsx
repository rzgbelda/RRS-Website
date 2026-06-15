import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "About Us | Room Ready Supply",
  description: "Room Ready Supply is a locally-focused hospitality supply company serving hotels, motels, short-term rentals, cleaning companies, and facilities.",
};

const VALUES = [
  { icon: "🤝", title: "Reliability", desc: "We show up on time with the products you ordered. No surprises, no substitutions without your approval." },
  { icon: "💡", title: "Simplicity", desc: "Ordering supplies shouldn't be a full-time job. We streamline the process so you can focus on your guests." },
  { icon: "📍", title: "Local Focus", desc: "We understand the unique needs of local hospitality businesses and are invested in the communities we serve." },
  { icon: "📈", title: "Partnership", desc: "We grow when you grow. Our goal is to be a long-term partner, not just another vendor." },
];

export default function AboutPage() {
  return (
    <>
      <TopBar />
      <Navbar />
      <div className="page-header-block">
        <h1 className="ph-title">About Room Ready Supply</h1>
        <div className="ph-line" />
        <p className="ph-sub">Supplying hospitality businesses with what they need, when they need it.</p>
      </div>

      <section className="about-page-section">
        <div className="about-page-inner">
          <div className="about-page-text">
            <h2>Our Story</h2>
            <div className="ph-line" style={{ margin: "12px 0 24px" }} />
            <p>
              Room Ready Supply was founded to solve a problem we kept seeing: hospitality businesses spending too much time chasing down supplies — dealing with inconsistent vendors, unexpected stockouts, and retail prices that cut into margins.
            </p>
            <p>
              We built a straightforward model — commercial-grade products at case pricing, with automated reorder programs that keep your shelves stocked without the manual effort. No minimums to stress over, no complicated contracts.
            </p>
            <p>
              Whether you run a 12-room motel, a growing short-term rental portfolio, or a commercial cleaning crew, we handle the supplies so you can focus on what you do best.
            </p>
          </div>
          <div className="about-page-values">
            <h2>What We Stand For</h2>
            <div className="ph-line" style={{ margin: "12px 0 24px" }} />
            <div className="about-values-grid">
              {VALUES.map((v) => (
                <div className="about-value-card" key={v.title}>
                  <span className="about-value-icon" aria-hidden="true">{v.icon}</span>
                  <div>
                    <h3>{v.title}</h3>
                    <p>{v.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="about-page-cta">
        <h2>Ready to Partner With Us?</h2>
        <p>Get in touch and we'll help you find the right setup for your business.</p>
        <div style={{ display: "flex", gap: "24px", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/contact" className="btn-primary">Contact Us</a>
          <a href="/business-pricing" className="btn-secondary">Request Pricing</a>
        </div>
      </section>

      <Footer />
    </>
  );
}
