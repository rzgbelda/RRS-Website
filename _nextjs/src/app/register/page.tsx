"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

const BUSINESS_TYPES = [
  "Hotel", "Motel", "Short-Term Rental", "Cleaning Company",
  "Restaurant", "Campground / RV Park", "Facility Management", "Other",
];

export default function RegisterPage() {
  const [form, setForm] = useState({
    fullName: "",
    businessName: "",
    businessType: BUSINESS_TYPES[0],
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.fullName,
          business_name: form.businessName,
          business_type: form.businessType,
          role: "customer",
        },
      },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setDone(true);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-banner">
        <Image src="/assets/hallway.png" alt="Hospitality hallway" fill style={{ objectFit: "cover" }} />
        <div className="auth-banner-overlay" />
        <div className="auth-banner-content">
          <Link href="/" className="auth-logo-link">
            <span className="logo-rr"><span className="blue-r">R</span><span className="orange-r">R</span></span>
          </Link>
          <h2>Room Ready Supply</h2>
          <p>Your trusted hospitality supply partner</p>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-box">
          {done ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "56px", marginBottom: "16px" }}>📬</div>
              <h1 className="auth-title">Check your email</h1>
              <p className="auth-sub" style={{ marginBottom: "24px" }}>
                We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account.
              </p>
              <Link href="/login" className="btn-primary" style={{ display: "inline-block" }}>Back to Sign In</Link>
            </div>
          ) : (
            <>
              <h1 className="auth-title">Create your account</h1>
              <p className="auth-sub">Sign up to start ordering supplies for your business.</p>

              {error && <div className="auth-error" role="alert">{error}</div>}

              <form onSubmit={handleRegister} className="auth-form" noValidate>
                <div className="field-group">
                  <div className="field">
                    <label htmlFor="r-name">Full Name *</label>
                    <input id="r-name" type="text" required placeholder="Jane Smith"
                      value={form.fullName} onChange={set("fullName")} />
                  </div>
                  <div className="field">
                    <label htmlFor="r-biz">Business Name *</label>
                    <input id="r-biz" type="text" required placeholder="Blue Heron Hotel"
                      value={form.businessName} onChange={set("businessName")} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="r-type">Business Type</label>
                  <select id="r-type" value={form.businessType} onChange={set("businessType")}
                    style={{ border: "1px solid #d1d5db", borderRadius: "6px", padding: "10px 14px", fontSize: "14px", width: "100%" }}>
                    {BUSINESS_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="r-email">Email Address *</label>
                  <input id="r-email" type="email" required placeholder="you@company.com"
                    value={form.email} onChange={set("email")} autoComplete="email" />
                </div>
                <div className="field-group">
                  <div className="field">
                    <label htmlFor="r-pw">Password *</label>
                    <div className="pw-wrap">
                      <input id="r-pw" type={showPw ? "text" : "password"} required
                        placeholder="Min. 8 characters" value={form.password} onChange={set("password")} />
                      <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)}
                        aria-label={showPw ? "Hide password" : "Show password"}>
                        <Image src="/assets/eye-off-line.svg" alt="" width={18} height={18} />
                      </button>
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="r-cpw">Confirm Password *</label>
                    <input id="r-cpw" type={showPw ? "text" : "password"} required
                      placeholder="Repeat password" value={form.confirmPassword} onChange={set("confirmPassword")} />
                  </div>
                </div>

                <button type="submit" className="submit-btn auth-submit" disabled={loading}>
                  {loading ? "Creating account…" : "Create Account"}
                </button>
              </form>

              <div className="auth-links">
                <span>Already have an account? </span>
                <Link href="/login">Sign in</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
