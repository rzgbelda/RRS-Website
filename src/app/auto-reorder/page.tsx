"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly", desc: "Every 7 days" },
  { value: "biweekly", label: "Every 2 Weeks", desc: "Every 14 days" },
  { value: "monthly", label: "Monthly", desc: "Every 30 days" },
  { value: "45-days", label: "Every 45 Days", desc: "Every 45 days" },
  { value: "60-days", label: "Every 60 Days", desc: "Every 60 days" },
  { value: "custom", label: "Custom Schedule", desc: "Set your own frequency" },
];

export default function AutoReorderPage() {
  const [submitted, setSubmitted] = useState(false);
  const [selectedFreq, setSelectedFreq] = useState("monthly");
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    products: "",
    customFreq: "",
    startDate: "",
    notes: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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
          <div style={{ fontSize: "64px", marginBottom: "20px" }}>⏰</div>
          <h2 style={{ fontSize: "32px", color: "#0f2b50", marginBottom: "16px" }}>
            Auto-Reorder Setup Received!
          </h2>
          <p style={{ fontSize: "18px", color: "#555", lineHeight: "1.6", marginBottom: "24px" }}>
            Great news! We received your reorder schedule request. Our team will set up your{" "}
            <strong>
              {FREQUENCY_OPTIONS.find((f) => f.value === selectedFreq)?.label}
            </strong>{" "}
            reorder schedule and send you a confirmation with the details. You will receive a
            reminder before each order is processed so you can approve, edit, or skip.
          </p>
          <p style={{ fontSize: "14px", color: "#888", marginBottom: "32px" }}>
            A confirmation will be sent to <strong>{form.email}</strong>.
          </p>
          <div
            style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}
          >
            <a href="/dashboard" className="btn-primary">
              My Dashboard
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
        <h1>⏰ Set Up Auto-Reorder</h1>
        <p>
          Set it once. Reorder made easy. Build your supply list and choose a reminder or
          recurring schedule so your team never starts from scratch.
        </p>
      </div>

      {/* HOW IT WORKS */}
      <section
        style={{
          background: "#0f2b57",
          color: "white",
          padding: "48px 40px",
        }}
      >
        <h2
          style={{
            textAlign: "center",
            fontSize: "28px",
            marginBottom: "36px",
            color: "white",
          }}
        >
          How Auto-Reorder Works
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "24px",
            maxWidth: "1000px",
            margin: "0 auto",
          }}
        >
          {[
            { n: "1", title: "Build Your List", desc: "Browse the catalog and select your regular supplies." },
            { n: "2", title: "Review & Match", desc: "We help confirm availability and pricing." },
            { n: "3", title: "First Order", desc: "Submit your first order and receive confirmation." },
            { n: "4", title: "Set Schedule", desc: "Choose your preferred reorder frequency." },
            { n: "5", title: "Get Reminded", desc: "Receive a reminder before each reorder date." },
            { n: "6", title: "Approve & Go", desc: "Approve, edit, skip, or pause — you decide." },
          ].map((s) => (
            <div key={s.n} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  background: "#f26f21",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                  fontSize: "20px",
                  fontWeight: "800",
                }}
              >
                {s.n}
              </div>
              <h4 style={{ fontSize: "15px", marginBottom: "6px" }}>{s.title}</h4>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", lineHeight: "1.5" }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="form-page">
        <form onSubmit={handleSubmit}>
          {/* FREQUENCY */}
          <div className="form-section-card">
            <h2>Choose Your Reorder Frequency</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "16px",
              }}
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <div
                  key={f.value}
                  onClick={() => setSelectedFreq(f.value)}
                  style={{
                    border: `2px solid ${selectedFreq === f.value ? "#f26f21" : "#e5e7eb"}`,
                    borderRadius: "10px",
                    padding: "20px",
                    cursor: "pointer",
                    background: selectedFreq === f.value ? "#fff8f4" : "white",
                    transition: "all 0.2s",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "24px",
                      marginBottom: "6px",
                    }}
                  >
                    {selectedFreq === f.value ? "✅" : "☐"}
                  </div>
                  <h4
                    style={{
                      color: "#0f2b50",
                      fontSize: "15px",
                      fontWeight: "700",
                      marginBottom: "4px",
                    }}
                  >
                    {f.label}
                  </h4>
                  <p style={{ fontSize: "13px", color: "#888" }}>{f.desc}</p>
                </div>
              ))}
            </div>

            {selectedFreq === "custom" && (
              <div className="field" style={{ marginTop: "20px", maxWidth: "400px" }}>
                <label>Describe Your Custom Schedule</label>
                <input
                  type="text"
                  name="customFreq"
                  value={form.customFreq}
                  onChange={handleChange}
                  placeholder="e.g., Every 3 weeks, First Monday of each month"
                />
              </div>
            )}
          </div>

          {/* BUSINESS INFO */}
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
                  placeholder="Your business name"
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
                <label>Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="(555) 000-0000"
                />
              </div>
            </div>
          </div>

          {/* SUPPLY LIST */}
          <div className="form-section-card">
            <h2>Your Regular Supply List</h2>
            <div className="field">
              <label>Products & Approximate Quantities *</label>
              <textarea
                name="products"
                value={form.products}
                onChange={handleChange}
                placeholder="List your regular supplies, e.g.:
- Toilet paper: 10 cases/month
- Paper towels (C-fold): 4 cases/month  
- Hand soap (foaming 1000mL): 6 units/month
- Trash liners (30 gal): 2 cases/month"
                style={{ minHeight: "160px" }}
                required
              />
            </div>
            <div className="field" style={{ marginTop: "16px", maxWidth: "300px" }}>
              <label>Preferred Start Date</label>
              <input
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* NOTES */}
          <div className="form-section-card">
            <h2>Additional Notes</h2>
            <div className="field">
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Delivery instructions, special requirements, or anything else we should know..."
              />
            </div>
          </div>

          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "10px",
              padding: "20px",
              marginBottom: "24px",
            }}
          >
            <p style={{ fontSize: "15px", color: "#166534", fontWeight: "600" }}>
              ✅ Approval-Based Reorder
            </p>
            <p style={{ fontSize: "14px", color: "#15803d", marginTop: "6px" }}>
              You will receive a reminder before every order is processed. You can approve, edit
              quantities, skip the order, pause the schedule, or cancel at any time. No surprises.
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "16px" }}>
            <Link href="/" className="btn-secondary" style={{ padding: "16px 32px" }}>
              Cancel
            </Link>
            <button type="submit" className="submit-btn">
              ⏰ Set Up My Reorder Schedule
            </button>
          </div>
        </form>
      </div>

      <Footer />
    </>
  );
}
