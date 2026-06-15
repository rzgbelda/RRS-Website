import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Terms of Service | Room Ready Supply",
};

export default function TermsPage() {
  return (
    <>
      <TopBar />
      <Navbar />
      <div className="page-header-block">
        <h1 className="ph-title">Terms of Service</h1>
        <div className="ph-line" />
        <p className="ph-sub">Last updated: June 2025</p>
      </div>

      <div className="legal-page">
        <section className="legal-section">
          <h2>1. Acceptance of Terms</h2>
          <p>By accessing or using the Room Ready Supply website and services, you agree to be bound by these Terms of Service. If you do not agree, please do not use our services.</p>
        </section>
        <section className="legal-section">
          <h2>2. Eligibility</h2>
          <p>Our services are intended for businesses and individuals purchasing supplies for commercial purposes. You must be at least 18 years old and authorized to make purchases on behalf of your organization.</p>
        </section>
        <section className="legal-section">
          <h2>3. Orders and Pricing</h2>
          <p>All orders are subject to availability. Prices are displayed per case and are subject to change without notice. Confirmed orders at the stated price will be honored. We reserve the right to cancel orders due to pricing errors or stock unavailability.</p>
        </section>
        <section className="legal-section">
          <h2>4. Payment</h2>
          <p>Payment is due at the time of order unless credit terms have been separately agreed upon in writing. We accept major credit cards and approved purchase orders.</p>
        </section>
        <section className="legal-section">
          <h2>5. Delivery</h2>
          <p>We will make reasonable efforts to deliver orders within the stated timeframe. Room Ready Supply is not liable for delays caused by circumstances beyond our control including weather events, carrier issues, or supply chain disruptions.</p>
        </section>
        <section className="legal-section">
          <h2>6. Returns and Refunds</h2>
          <p>Damaged or incorrect items must be reported within 5 business days of delivery. We will replace defective items or issue a credit at our discretion. Opened cases of consumable products are not eligible for return.</p>
        </section>
        <section className="legal-section">
          <h2>7. Limitation of Liability</h2>
          <p>Room Ready Supply's total liability for any claim shall not exceed the amount paid for the specific order giving rise to the claim. We are not liable for indirect, incidental, or consequential damages.</p>
        </section>
        <section className="legal-section">
          <h2>8. Contact</h2>
          <p>For questions about these terms, contact us at <a href="mailto:info@roomreadysupply.com">info@roomreadysupply.com</a>.</p>
        </section>
      </div>

      <Footer />
    </>
  );
}
