"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      window.location.href = "/dashboard";
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
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Sign in to manage your orders and account.</p>

          {error && (
            <div className="auth-error" role="alert">{error}</div>
          )}

          <form onSubmit={handleLogin} className="auth-form" noValidate>
            <div className="field">
              <label htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="login-password">Password</label>
              <div className="pw-wrap">
                <input
                  id="login-password"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  <Image src="/assets/eye-off-line.svg" alt="" width={18} height={18} />
                </button>
              </div>
            </div>

            <button type="submit" className="submit-btn auth-submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="auth-links">
            <span>Don't have an account? </span>
            <Link href="/register">Register here</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
