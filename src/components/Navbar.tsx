"use client";

import Link from "next/link";
import { useState } from "react";

interface NavbarProps {
  cartCount?: number;
}

export default function Navbar({ cartCount = 0 }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="navbar">
      <Link href="/" className="logo">
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

      <Link href="/order" className="cart-btn">
        🛒 {cartCount > 0 ? `${cartCount} Items` : "My Order"}
      </Link>
    </header>
  );
}
