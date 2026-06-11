"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const CATEGORIES = [
  "Toilet Paper",
  "Paper Towels",
  "Trash Liners",
  "Cleaning Chemicals",
  "Hand Soap",
  "Laundry Supplies",
  "Dishwashing Supplies",
  "Guest Room Supplies",
  "Towels and Linens",
  "Food Service Supplies",
  "Facility Supplies",
];

const PRODUCTS = [
  { id: 1, name: "Standard Toilet Paper Roll", category: "Toilet Paper", packSize: "2-Ply", caseQty: "96 Rolls/Case", price: "Call for Pricing" },
  { id: 2, name: "Jumbo Toilet Paper Roll", category: "Toilet Paper", packSize: "2-Ply Jumbo", caseQty: "12 Rolls/Case", price: "Call for Pricing" },
  { id: 3, name: "C-Fold Paper Towels", category: "Paper Towels", packSize: "200 Sheets/Pack", caseQty: "12 Packs/Case", price: "Call for Pricing" },
  { id: 4, name: "Multifold Paper Towels", category: "Paper Towels", packSize: "250 Sheets/Pack", caseQty: "16 Packs/Case", price: "Call for Pricing" },
  { id: 5, name: "Kitchen Trash Liners", category: "Trash Liners", packSize: "30 Gallon", caseQty: "200/Case", price: "Call for Pricing" },
  { id: 6, name: "Heavy Duty Can Liners", category: "Trash Liners", packSize: "55 Gallon", caseQty: "100/Case", price: "Call for Pricing" },
  { id: 7, name: "All-Purpose Cleaner", category: "Cleaning Chemicals", packSize: "1 Gallon", caseQty: "4/Case", price: "Call for Pricing" },
  { id: 8, name: "Disinfectant Spray", category: "Cleaning Chemicals", packSize: "32 oz", caseQty: "12/Case", price: "Call for Pricing" },
  { id: 9, name: "Foaming Hand Soap", category: "Hand Soap", packSize: "1000 mL", caseQty: "6/Case", price: "Call for Pricing" },
  { id: 10, name: "Liquid Hand Soap", category: "Hand Soap", packSize: "800 mL", caseQty: "12/Case", price: "Call for Pricing" },
  { id: 11, name: "Laundry Detergent", category: "Laundry Supplies", packSize: "5 Gallon", caseQty: "1/Case", price: "Call for Pricing" },
  { id: 12, name: "Fabric Softener Sheets", category: "Laundry Supplies", packSize: "200 Sheets", caseQty: "6/Case", price: "Call for Pricing" },
  { id: 13, name: "Dishwashing Liquid", category: "Dishwashing Supplies", packSize: "1 Gallon", caseQty: "4/Case", price: "Call for Pricing" },
  { id: 14, name: "Commercial Rinse Aid", category: "Dishwashing Supplies", packSize: "1 Gallon", caseQty: "4/Case", price: "Call for Pricing" },
  { id: 15, name: "Hotel Shampoo", category: "Guest Room Supplies", packSize: "1 oz", caseQty: "144/Case", price: "Call for Pricing" },
  { id: 16, name: "Body Lotion", category: "Guest Room Supplies", packSize: "1 oz", caseQty: "144/Case", price: "Call for Pricing" },
  { id: 17, name: "Bath Towels", category: "Towels and Linens", packSize: "27\" x 54\"", caseQty: "12/Case", price: "Call for Pricing" },
  { id: 18, name: "Hand Towels", category: "Towels and Linens", packSize: "16\" x 30\"", caseQty: "12/Case", price: "Call for Pricing" },
  { id: 19, name: "Disposable Gloves", category: "Food Service Supplies", packSize: "Medium", caseQty: "1000/Case", price: "Call for Pricing" },
  { id: 20, name: "Deli Wrap Paper", category: "Food Service Supplies", packSize: "12\" x 12\"", caseQty: "1000/Case", price: "Call for Pricing" },
  { id: 21, name: "Mop Heads", category: "Facility Supplies", packSize: "24 oz", caseQty: "12/Case", price: "Call for Pricing" },
  { id: 22, name: "Floor Cleaner", category: "Facility Supplies", packSize: "1 Gallon", caseQty: "4/Case", price: "Call for Pricing" },
];

export default function CatalogPage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const filtered = PRODUCTS.filter((p) => {
    const matchesCat =
      selectedCategories.length === 0 || selectedCategories.includes(p.category);
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <>
      <TopBar />
      <Navbar />

      <section className="catalog-header">
        <h1>Shop Catalog</h1>
        <p>
          Browse core hospitality and facility supplies by category. Select what you need,
          add quantities, and submit your order request.
        </p>
        <div style={{ marginTop: "20px", display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: "400px" }}>
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 44px 12px 16px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontSize: "15px",
              }}
            />
            <span
              style={{
                position: "absolute",
                right: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "20px",
                color: "#888",
              }}
            >
              🔍
            </span>
          </div>
        </div>
      </section>

      <section className="catalog-page">
        <aside className="catalog-sidebar">
          <h3>▽ CATEGORIES</h3>
          <div className="filter-list">
            {CATEGORIES.map((cat) => (
              <label key={cat}>
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(cat)}
                  onChange={() => toggleCategory(cat)}
                />
                {cat}
              </label>
            ))}
          </div>
        </aside>

        <main className="catalog-products">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <p style={{ color: "#666", fontSize: "14px" }}>
              Showing {filtered.length} products
              {selectedCategories.length > 0 && ` in ${selectedCategories.join(", ")}`}
            </p>
            {selectedCategories.length > 0 && (
              <button
                onClick={() => setSelectedCategories([])}
                style={{
                  background: "none",
                  border: "1px solid #f26f21",
                  color: "#f26f21",
                  borderRadius: "4px",
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="catalog-grid">
            {filtered.map((product) => (
              <div className="product-card" key={product.id}>
                <Link href={`/catalog/${product.id}`}>
                  <div className="product-box">
                    <Image
                      src="/assets/sampleitem.svg"
                      alt={product.name}
                      width={110}
                      height={110}
                    />
                    <p>{product.name}</p>
                  </div>
                </Link>
                <div style={{ marginTop: "8px" }}>
                  <p style={{ fontSize: "12px", color: "#888", marginBottom: "2px" }}>
                    {product.category}
                  </p>
                  <p style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                    {product.caseQty}
                  </p>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#f26f21",
                      fontWeight: "700",
                      marginBottom: "8px",
                    }}
                  >
                    {product.price}
                  </p>
                </div>
                <button className="add-cart">🛒 ADD TO ORDER</button>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div
              style={{ textAlign: "center", padding: "60px 20px", color: "#888" }}
            >
              <p style={{ fontSize: "18px" }}>No products found.</p>
              <p style={{ fontSize: "14px", marginTop: "8px" }}>
                Try adjusting your filters or search term.
              </p>
            </div>
          )}
        </main>
      </section>

      <Footer />
    </>
  );
}
