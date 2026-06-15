"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mailto = `mailto:info@roomreadysupply.com?subject=${encodeURIComponent(form.subject || "Contact from website")}&body=${encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`)}`;
    window.location.href = mailto;
    setSubmitted(true);
  };

  return (
    <>
      <TopBar />
      <Navbar />
      <div className="page-header-block">
        <h1 className="ph-title">Contact Us</h1>
        <div className="ph-line" />
        <p className="ph-sub">Have a question or ready to get started? Reach out and we'll respond within one business day.</p>
      </div>

      <section className="contact-section">
        <div className="contact-inner">
          <div className="contact-info">
            <h2>Get in Touch</h2>
            <div className="ph-line" style={{ margin: "12px 0 24px" }} />
            <div className="contact-detail">
              <span className="contact-icon" aria-hidden="true">📧</span>
              <div>
                <strong>Email</strong>
                <a href="mailto:info@roomreadysupply.com">info@roomreadysupply.com</a>
              </div>
            </div>
            <div className="contact-detail">
              <span className="contact-icon" aria-hidden="true">📞</span>
              <div>
                <strong>Phone</strong>
                <a href="tel:+1-800-555-0100">(800) 555-0100</a>
              </div>
            </div>
            <div className="contact-detail">
              <span className="contact-icon" aria-hidden="true">⏰</span>
              <div>
                <strong>Business Hours</strong>
                <span>Mon – Fri, 8:00 AM – 5:00 PM</span>
              </div>
            </div>
            <div className="contact-note">
              For faster service on pricing or orders, use our{" "}
              <a href="/business-pricing" style={{ color: "#f26f21" }}>Business Pricing Request</a> form.
            </div>
          </div>

          <div className="contact-form-box">
            {submitted ? (
              <div className="contact-success">
                <div style={{ fontSize: "48px", marginBottom: "12px" }}>✅</div>
                <h2>Message Sent</h2>
                <p>Your email client should have opened. If not, email us directly at <a href="mailto:info@roomreadysupply.com">info@roomreadysupply.com</a>.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="contact-form" noValidate>
                <h2>Send a Message</h2>
                <div className="ph-line" style={{ margin: "12px 0 24px" }} />
                <div className="field">
                  <label htmlFor="c-name">Your Name *</label>
                  <input id="c-name" type="text" required placeholder="Jane Smith"
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="c-email">Email Address *</label>
                  <input id="c-email" type="email" required placeholder="jane@yourcompany.com"
                    value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="c-subject">Subject</label>
                  <input id="c-subject" type="text" placeholder="What's this about?"
                    value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="c-message">Message *</label>
                  <textarea id="c-message" required rows={5} placeholder="How can we help?"
                    value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                </div>
                <button type="submit" className="submit-btn" style={{ marginTop: "8px" }}>
                  Send Message
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
