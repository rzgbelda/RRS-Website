"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const PRODUCTS: Record<
  number,
  {
    id: number;
    name: string;
    category: string;
    description: string;
    packSize: string;
    caseQty: string;
    minOrder: string;
    price: string;
  }
> = {
  1: {
    id: 1,
    name: "Standard Toilet Paper Roll",
    category: "Toilet Paper",
    description:
      "2-ply standard toilet paper rolls designed for high-traffic hospitality environments. Soft, absorbent, and reliable for hotels, motels, rental properties, and facility restrooms. Wrapped individually for hygienic storage and distribution.",
    packSize: "2-Ply",
    caseQty: "96 Rolls/Case",
    minOrder: "1 Case",
    price: "Request Pricing",
  },
  2: {
    id: 2,
    name: "Jumbo Toilet Paper Roll",
    category: "Toilet Paper",
    description:
      "High-capacity jumbo rolls ideal for commercial restrooms with heavy daily traffic. Fits standard jumbo roll dispensers. Reduces refill frequency and restroom downtime.",
    packSize: "2-Ply Jumbo",
    caseQty: "12 Rolls/Case",
    minOrder: "1 Case",
    price: "Request Pricing",
  },
};

export default function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const id = parseInt(params.id, 10);
  const product = PRODUCTS[id] ?? {
    id,
    name: "Product Item",
    category: "Supplies",
    description:
      "Everyday hospitality supply product. Contact us for detailed product specifications, volume pricing, and availability. We serve hotels, motels, short-term rentals, cleaning companies, restaurants, campgrounds, RV parks, and facilities.",
    packSize: "Standard",
    caseQty: "Available by Case",
    minOrder: "1 Case",
    price: "Request Pricing",
  };

  const handleAdd = () => {
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  return (
    <>
      <TopBar />
      <Navbar />

      <div style={{ padding: "20px 40px", fontSize: "14px", color: "#888" }}>
        <Link href="/" style={{ color: "#888", textDecoration: "none" }}>
          Home
        </Link>{" "}
        /{" "}
        <Link href="/catalog" style={{ color: "#888", textDecoration: "none" }}>
          Catalog
        </Link>{" "}
        / <span style={{ color: "#333" }}>{product.name}</span>
      </div>

      <div className="product-detail">
        <div className="product-image-box">
          <Image
            src="/assets/sampleitem.svg"
            alt={product.name}
            width={200}
            height={200}
          />
        </div>

        <div className="product-info">
          <p
            style={{
              fontSize: "13px",
              color: "#f26f21",
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: "8px",
            }}
          >
            {product.category}
          </p>
          <h1>{product.name}</h1>
          <p className="desc">{product.description}</p>

          <div className="product-specs">
            <div className="spec-item">
              <Image src="/assets/pack.svg" alt="Pack size" width={24} height={24} />
              <div>
                <div className="spec-label">Pack Size</div>
                <div className="spec-value">{product.packSize}</div>
              </div>
            </div>
            <div className="spec-item">
              <Image src="/assets/box.svg" alt="Case quantity" width={24} height={24} />
              <div>
                <div className="spec-label">Case Quantity</div>
                <div className="spec-value">{product.caseQty}</div>
              </div>
            </div>
            <div className="spec-item">
              <Image src="/assets/truck.svg" alt="Min order" width={24} height={24} />
              <div>
                <div className="spec-label">Min Order</div>
                <div className="spec-value">{product.minOrder}</div>
              </div>
            </div>
            <div className="spec-item">
              <Image src="/assets/secure.svg" alt="Stock" width={24} height={24} />
              <div>
                <div className="spec-label">Status</div>
                <div className="spec-value" style={{ color: "#16a34a" }}>
                  In Stock
                </div>
              </div>
            </div>
          </div>

          <div className="product-price">
            {product.price}{" "}
            <span>/ case — contact for volume pricing</span>
          </div>

          <div className="qty-row">
            <button className="qty-btn" onClick={() => setQty(Math.max(1, qty - 1))}>
              −
            </button>
            <span className="qty-display">{qty}</span>
            <button className="qty-btn" onClick={() => setQty(qty + 1)}>
              +
            </button>
            <span style={{ fontSize: "14px", color: "#888" }}>cases</span>
          </div>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <button
              className="submit-btn"
              onClick={handleAdd}
              style={{ fontSize: "15px" }}
            >
              {added ? "✓ Added to Order" : "🛒 Add to Order"}
            </button>
            <Link
              href="/order"
              className="btn-secondary"
              style={{ padding: "14px 28px", borderRadius: "8px", fontSize: "15px" }}
            >
              📋 View My Order
            </Link>
          </div>

          <div
            style={{
              marginTop: "32px",
              padding: "16px",
              background: "#f0f7ff",
              borderRadius: "8px",
              borderLeft: "4px solid #28476a",
            }}
          >
            <p style={{ fontSize: "14px", color: "#28476a", fontWeight: "600" }}>
              💼 Need recurring orders?
            </p>
            <p style={{ fontSize: "13px", color: "#555", marginTop: "6px" }}>
              Set up an auto-reorder schedule and never run out of this product.{" "}
              <Link
                href="/auto-reorder"
                style={{ color: "#f26f21", fontWeight: "600" }}
              >
                Set Up Auto-Reorder →
              </Link>
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
