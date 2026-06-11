"use client";

import { useState } from "react";
import Image from "next/image";
import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const CUSTOMER_TYPES = [
  "Hotel",
  "Motel",
  "Short-Term Rental / Airbnb",
  "Cleaning Company",
  "Restaurant",
  "Campground",
  "RV Park",
  "Property Manager",
  "Facility Manager",
  "Other",
];

export default function BusinessPricingPage() {
  const [submitted, setSubmitted] = useState(false);
  const [fileName, setFileName] = useState("");
  const [form, setForm] = useState({
    businessName: "",
    customerType: "",
    contactName: "",
    phone: "",
    email: "",
    currentSupplier: "",
    products: "",
    monthlyUsage: "",
    notes: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (submitted) {
    return (
      <>
        <TopBar />
        <Navbar />
        <div
          style={{
            maxWidth: "640px",
            margin: "80px auto",
            padding: "48px",
            textAlign: "center",
            background: "white",
            borderRadius: "16px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontSize: "64px", marginBottom: "20px" }}>📄</div>
          <h2 style={{ fontSize: "32px", color: "#0f2b50", marginBottom: "16px" }}>
            Quote Request Received!
          </h2>
          <p style={{ fontSize: "18px", color: "#555", lineHeight: "1.6", marginBottom: "24px" }}>
            Thank you, <strong>{form.contactName || "valued customer"}</strong>. We received your
            business pricing request for <strong>{form.businessName}</strong>. Our team will review
            your supply needs and respond with competitive case pricing within 1–2 business days.
          </p>
          <p style={{ fontSize: "14px", color: "#888", marginBottom: "32px" }}>
            A confirmation will be sent to <strong>{form.email}</strong>.
          </p>
          <div
            style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}
          >
            <a href="/catalog" className="btn-primary">
              Browse Catalog
            </a>
            <a href="/" className="btn-secondary">
              Back to Home
            </a>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <TopBar />
      <Navbar />

      <section className="pricing-request-section" id="business-pricing">
        <div className="pricing-wrapper">
          <div className="pricing-form-area">
            <h2>Request Business Pricing</h2>
            <div className="pricing-title-line" />
            <p className="pricing-intro">
              Let us quote the products you already buy. Send your current supply list, invoice, or
              estimated monthly usage and we will help review available options.
            </p>

            <div className="pricing-benefits">
              <div className="benefit-item">
                <span className="benefit-icon">
                  <Image src="/assets/bsp1.svg" alt="Case pricing" width={36} height={36} />
                </span>
                <strong>
                  Competitive
                  <br />
                  Case Pricing
                </strong>
              </div>
              <div className="benefit-item">
                <span className="benefit-icon">
                  <Image src="/assets/bsp2.svg" alt="Hospitality" width={36} height={36} />
                </span>
                <strong>
                  Hospitality
                  <br />
                  Focused Products
                </strong>
              </div>
              <div className="benefit-item">
                <span className="benefit-icon">
                  <Image src="/assets/bsp3.svg" alt="Local support" width={36} height={36} />
                </span>
                <strong>
                  Local
                  <br />
                  Support
                </strong>
              </div>
              <div className="benefit-item">
                <span className="benefit-icon">
                  <Image src="/assets/bsp4.svg" alt="Reorder" width={36} height={36} />
                </span>
                <strong>
                  Easy Reorder
                  <br />
                  Program
                </strong>
              </div>
            </div>

            <form className="business-form" onSubmit={handleSubmit}>
              <div className="form-columns">
                <div className="form-column">
                  <h3>Business Information</h3>

                  <label>Business Name *</label>
                  <input
                    type="text"
                    name="businessName"
                    value={form.businessName}
                    onChange={handleChange}
                    placeholder="Enter business name"
                    required
                  />

                  <label>Customer Type *</label>
                  <select
                    name="customerType"
                    value={form.customerType}
                    onChange={handleChange}
                    required
                    style={{
                      width: "100%",
                      height: "36px",
                      border: "1px solid #999",
                      borderRadius: "3px",
                      padding: "0 10px",
                      marginBottom: "12px",
                      fontSize: "12px",
                    }}
                  >
                    <option value="">Select customer type</option>
                    {CUSTOMER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>

                  <label>Contact Name *</label>
                  <input
                    type="text"
                    name="contactName"
                    value={form.contactName}
                    onChange={handleChange}
                    placeholder="Enter contact name"
                    required
                  />

                  <label>Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="(555) 000-0000"
                  />

                  <label>Email *</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Enter email address"
                    required
                  />
                </div>

                <div className="form-column">
                  <h3>Supply Information</h3>

                  <label>Current Supplier (if known)</label>
                  <input
                    type="text"
                    name="currentSupplier"
                    value={form.currentSupplier}
                    onChange={handleChange}
                    placeholder="Enter current supplier"
                  />

                  <label>Regular Products You Buy</label>
                  <input
                    type="text"
                    name="products"
                    value={form.products}
                    onChange={handleChange}
                    placeholder="e.g., paper products, cleaning supplies, soaps"
                  />

                  <label>Estimated Monthly Usage</label>
                  <input
                    type="text"
                    name="monthlyUsage"
                    value={form.monthlyUsage}
                    onChange={handleChange}
                    placeholder="e.g., $500–$1,000"
                  />

                  <label>Upload Current Invoice / Sample Order</label>
                  <label className="upload-box">
                    <div>
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
                    <strong>{fileName || "Drag & drop your file here"}</strong>
                    <span style={{ fontSize: "12px", color: "#666" }}>or browse to upload</span>
                    <small style={{ color: "#aaa" }}>PDF, JPG, PNG (Max 10MB)</small>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        if (e.target.files?.[0]) setFileName(e.target.files[0].name);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="notes-area">
                <label>
                  Additional Notes
                  <br />
                  <span>(delivery location, recurring supplies, etc.)</span>
                </label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Tell us anything else that will help us quote your business"
                />
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

      <Footer />
    </>
  );
}
