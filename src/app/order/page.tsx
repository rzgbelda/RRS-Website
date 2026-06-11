"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const FREQUENCY_OPTIONS = [
  "Weekly",
  "Every 2 Weeks",
  "Monthly",
  "Every 45 Days",
  "Every 60 Days",
  "Custom Schedule",
];

export default function OrderPage() {
  const [orderType, setOrderType] = useState<"one-time" | "reorder">("one-time");
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    products: "",
    quantity: "",
    frequency: "Monthly",
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
          <div style={{ fontSize: "64px", marginBottom: "20px" }}>✅</div>
          <h2 style={{ fontSize: "32px", color: "#0f2b50", marginBottom: "16px" }}>
            Order Request Received!
          </h2>
          <p style={{ fontSize: "18px", color: "#555", lineHeight: "1.6", marginBottom: "24px" }}>
            Thank you, <strong>{form.contactName || "valued customer"}</strong>. We have received
            your order request for <strong>{form.businessName}</strong>. Our team will review your
            request and confirm pricing, availability, and delivery details within 1 business day.
          </p>
          <p style={{ fontSize: "14px", color: "#888", marginBottom: "32px" }}>
            A confirmation email will be sent to <strong>{form.email}</strong>.
          </p>
          <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/catalog" className="btn-primary">
              Continue Browsing
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

      <div className="page-header">
        <h1>Submit Order Request</h1>
        <p>
          Fill out your business details and the products you need. We will confirm pricing,
          availability, and delivery within 1 business day.
        </p>
      </div>

      <div className="form-page">
        <form onSubmit={handleSubmit}>
          {/* ORDER TYPE */}
          <div className="form-section-card">
            <h2>Order Type</h2>
            <div className="order-type-grid">
              <div
                className={`order-type-option ${orderType === "one-time" ? "selected" : ""}`}
                onClick={() => setOrderType("one-time")}
              >
                <h3>🛒 One-Time Order</h3>
                <p>A single order for your current supply needs.</p>
              </div>
              <div
                className={`order-type-option ${orderType === "reorder" ? "selected" : ""}`}
                onClick={() => setOrderType("reorder")}
              >
                <h3>🔄 Reorder Setup</h3>
                <p>Set up a recurring order on your preferred schedule.</p>
              </div>
            </div>
          </div>

          {/* CUSTOMER DETAILS */}
          <div className="form-section-card">
            <h2>Business Information</h2>
            <div className="field-group">
              <div className="field">
                <label>Business Name *</label>
                <input
                  type="text"
                  name="businessName"
                  value={form.businessName}
                  onChange={handleChange}
                  placeholder="Enter your business name"
                  required
                />
              </div>
              <div className="field">
                <label>Contact Name *</label>
                <input
                  type="text"
                  name="contactName"
                  value={form.contactName}
                  onChange={handleChange}
                  placeholder="Your full name"
                  required
                />
              </div>
              <div className="field">
                <label>Email Address *</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="your@email.com"
                  required
                />
              </div>
              <div className="field">
                <label>Phone Number *</label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="(555) 000-0000"
                  required
                />
              </div>
            </div>
          </div>

          {/* DELIVERY ADDRESS */}
          <div className="form-section-card">
            <h2>Delivery Address</h2>
            <div className="field-group">
              <div className="field full">
                <label>Street Address *</label>
                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="123 Main Street"
                  required
                />
              </div>
              <div className="field">
                <label>City *</label>
                <input
                  type="text"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  placeholder="City"
                  required
                />
              </div>
              <div className="field">
                <label>State</label>
                <input
                  type="text"
                  name="state"
                  value={form.state}
                  onChange={handleChange}
                  placeholder="State"
                />
              </div>
              <div className="field">
                <label>ZIP Code</label>
                <input
                  type="text"
                  name="zip"
                  value={form.zip}
                  onChange={handleChange}
                  placeholder="ZIP"
                />
              </div>
            </div>
          </div>

          {/* PRODUCTS */}
          <div className="form-section-card">
            <h2>Products & Quantities</h2>
            <div className="field-group">
              <div className="field full">
                <label>Products You Need *</label>
                <textarea
                  name="products"
                  value={form.products}
                  onChange={handleChange}
                  placeholder="List the products you need, e.g.: Toilet Paper (96 rolls/case), Paper Towels (C-fold), Hand Soap (1000mL foaming)..."
                  style={{ minHeight: "120px" }}
                  required
                />
              </div>
              <div className="field">
                <label>Estimated Quantities</label>
                <input
                  type="text"
                  name="quantity"
                  value={form.quantity}
                  onChange={handleChange}
                  placeholder="e.g., 5 cases toilet paper, 2 cases soap"
                />
              </div>
            </div>
          </div>

          {/* REORDER FREQUENCY */}
          {orderType === "reorder" && (
            <div className="form-section-card">
              <h2>Reorder Schedule</h2>
              <p style={{ color: "#555", fontSize: "14px", marginBottom: "20px" }}>
                You will receive a reminder before each order is processed. You can approve, edit,
                skip, pause, or cancel at any time.
              </p>
              <div className="field-group">
                <div className="field">
                  <label>Reorder Frequency *</label>
                  <select name="frequency" value={form.frequency} onChange={handleChange}>
                    {FREQUENCY_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* NOTES */}
          <div className="form-section-card">
            <h2>Additional Notes</h2>
            <div className="field">
              <label>Notes</label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Any special delivery instructions, preferred contact times, or additional information..."
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "16px" }}>
            <a href="/catalog" className="btn-secondary" style={{ padding: "16px 32px" }}>
              ← Back to Catalog
            </a>
            <button type="submit" className="submit-btn">
              Submit Order Request →
            </button>
          </div>
        </form>
      </div>

      <Footer />
    </>
  );
}
