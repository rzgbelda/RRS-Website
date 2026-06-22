"use client";

import Link from "next/link";
import { useState } from "react";

interface NavbarProps {
  cartCount?: number;
}

export default function Navbar({ cartCount = 0 }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="navbar">
      <Link href="/" className="logo" onClick={closeMenu}>
        <div className="logo-rr">
          <span className="blue-r">R</span>
          <span className="orange-r">R</span>
        </div>
        <div className="logo-text">
          <h2>Room Ready</h2>
          <p>SUPPLY</p>
        </div>
      </Link>

      <nav>
        <Link href="/">Home</Link>
        <Link href="/catalog">Catalog</Link>
        <Link href="/#how-it-works">How it Works</Link>
        <Link href="/#reorder-program">Reorder Program</Link>
        <Link href="/business-pricing">Business Pricing</Link>
        <Link href="/#about-us">About Us</Link>
        <Link href="/#contact">Contact</Link>
      </nav>

      <div className="navbar-right">
        <Link href="/order" className="cart-btn">
          🛒 {cartCount > 0 ? `${cartCount} Items` : "My Order"}
        </Link>

        <button
          className="hamburger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          <span className={`ham-line ${menuOpen ? "open" : ""}`} />
          <span className={`ham-line ${menuOpen ? "open" : ""}`} />
          <span className={`ham-line ${menuOpen ? "open" : ""}`} />
        </button>
      </div>

      {menuOpen && (
        <div className="mobile-menu">
          <Link href="/" onClick={closeMenu}>Home</Link>
          <Link href="/catalog" onClick={closeMenu}>Catalog</Link>
          <Link href="/#how-it-works" onClick={closeMenu}>How it Works</Link>
          <Link href="/#reorder-program" onClick={closeMenu}>Reorder Program</Link>
          <Link href="/business-pricing" onClick={closeMenu}>Business Pricing</Link>
          <Link href="/#about-us" onClick={closeMenu}>About Us</Link>
          <Link href="/#contact" onClick={closeMenu}>Contact</Link>
          <Link href="/order" className="mobile-cart-btn" onClick={closeMenu}>
            🛒 {cartCount > 0 ? `${cartCount} Items` : "My Order"}
          </Link>
        </div>
      )}
    </header>
  );
}
