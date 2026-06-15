import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Privacy Policy | Room Ready Supply",
};

export default function PrivacyPage() {
  return (
    <>
      <TopBar />
      <Navbar />
      <div className="page-header-block">
        <h1 className="ph-title">Privacy Policy</h1>
        <div className="ph-line" />
        <p className="ph-sub">Last updated: June 2025</p>
      </div>

      <div className="legal-page">
        <section className="legal-section">
          <h2>1. Information We Collect</h2>
          <p>We collect information you provide directly to us, including name, business name, email address, phone number, and shipping address when you create an account, place an order, or contact us.</p>
        </section>
        <section className="legal-section">
          <h2>2. How We Use Your Information</h2>
          <p>We use the information we collect to process orders, send order confirmations and updates, respond to inquiries, and send occasional promotional offers (which you may opt out of at any time).</p>
        </section>
        <section className="legal-section">
          <h2>3. Information Sharing</h2>
          <p>We do not sell, rent, or share your personal information with third parties for their marketing purposes. We may share information with service providers who assist in order fulfillment and business operations, under confidentiality agreements.</p>
        </section>
        <section className="legal-section">
          <h2>4. Data Security</h2>
          <p>We implement reasonable security measures to protect your information. Account passwords are hashed and never stored in plain text. Payment data is handled by PCI-compliant processors and not stored on our servers.</p>
        </section>
        <section className="legal-section">
          <h2>5. Cookies</h2>
          <p>We use essential cookies to keep you logged in and remember your cart. We do not use third-party advertising cookies.</p>
        </section>
        <section className="legal-section">
          <h2>6. Your Rights</h2>
          <p>You may request access to, correction of, or deletion of your personal data by contacting us at <a href="mailto:info@roomreadysupply.com">info@roomreadysupply.com</a>.</p>
        </section>
        <section className="legal-section">
          <h2>7. Contact</h2>
          <p>Questions about this policy? Email us at <a href="mailto:info@roomreadysupply.com">info@roomreadysupply.com</a>.</p>
        </section>
      </div>

      <Footer />
    </>
  );
}
