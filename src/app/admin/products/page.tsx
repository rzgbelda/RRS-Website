"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";

const CATEGORIES = [
  "Toilet Paper", "Paper Towels", "Trash Liners", "Cleaning Chemicals",
  "Hand Soap", "Laundry Supplies", "Dishwashing Supplies", "Guest Room Supplies",
  "Towels and Linens", "Food Service Supplies", "Facility Supplies",
];

const INITIAL_PRODUCTS = [
  { id: 1, name: "Standard Toilet Paper Roll", category: "Toilet Paper", packSize: "2-Ply", caseQty: "96 Rolls", price: "$48.00", stock: "In Stock" },
  { id: 2, name: "Jumbo Toilet Paper Roll", category: "Toilet Paper", packSize: "Jumbo 2-Ply", caseQty: "12 Rolls", price: "$62.00", stock: "In Stock" },
  { id: 3, name: "C-Fold Paper Towels", category: "Paper Towels", packSize: "200 Sheets", caseQty: "12 Packs", price: "$34.00", stock: "In Stock" },
  { id: 4, name: "Foaming Hand Soap", category: "Hand Soap", packSize: "1000 mL", caseQty: "6 Units", price: "$55.00", stock: "In Stock" },
  { id: 5, name: "All-Purpose Cleaner", category: "Cleaning Chemicals", packSize: "1 Gallon", caseQty: "4/Case", price: "$42.00", stock: "Low Stock" },
];

export default function AdminProductsPage() {
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [showForm, setShowForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "", category: CATEGORIES[0], packSize: "", caseQty: "", price: "", stock: "In Stock",
  });

  const handleAdd = () => {
    if (!newProduct.name) return;
    setProducts([
      ...products,
      { id: products.length + 1, ...newProduct },
    ]);
    setNewProduct({ name: "", category: CATEGORIES[0], packSize: "", caseQty: "", price: "", stock: "In Stock" });
    setShowForm(false);
  };

  const handleDelete = (id: number) => {
    setProducts(products.filter((p) => p.id !== id));
  };

  return (
    <>
      <TopBar />
      <div style={{ background: "#0f2b57", padding: "0 40px", display: "flex", alignItems: "center", height: "64px" }}>
        <Link href="/admin" style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none", fontSize: "14px" }}>
          ← Admin Overview
        </Link>
        <span style={{ color: "white", fontWeight: "700", fontSize: "18px", marginLeft: "24px" }}>
          📦 Products
        </span>
      </div>

      <div className="dashboard-content" style={{ padding: "32px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h1 className="dashboard-title" style={{ margin: 0 }}>Product Management</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="submit-btn"
          >
            {showForm ? "Cancel" : "+ Add Product"}
          </button>
        </div>

        {showForm && (
          <div className="form-section-card" style={{ marginBottom: "24px" }}>
            <h2>Add New Product</h2>
            <div className="field-group">
              <div className="field">
                <label>Product Name *</label>
                <input type="text" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Enter product name" />
              </div>
              <div className="field">
                <label>Category *</label>
                <select value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                  style={{ border: "1px solid #d1d5db", borderRadius: "6px", padding: "10px 14px", fontSize: "14px" }}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Pack Size</label>
                <input type="text" value={newProduct.packSize} onChange={(e) => setNewProduct({ ...newProduct, packSize: e.target.value })} placeholder="e.g., 2-Ply, 1 Gallon" />
              </div>
              <div className="field">
                <label>Case Quantity</label>
                <input type="text" value={newProduct.caseQty} onChange={(e) => setNewProduct({ ...newProduct, caseQty: e.target.value })} placeholder="e.g., 96 Rolls/Case" />
              </div>
              <div className="field">
                <label>Price Per Case</label>
                <input type="text" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} placeholder="e.g., $48.00" />
              </div>
              <div className="field">
                <label>Stock Status</label>
                <select value={newProduct.stock} onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                  style={{ border: "1px solid #d1d5db", borderRadius: "6px", padding: "10px 14px", fontSize: "14px" }}>
                  <option>In Stock</option>
                  <option>Low Stock</option>
                  <option>Out of Stock</option>
                </select>
              </div>
            </div>
            <button onClick={handleAdd} className="submit-btn" style={{ marginTop: "16px" }}>
              Save Product
            </button>
          </div>
        )}

        <div className="data-table">
          <h2>All Products ({products.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Category</th>
                <th>Pack Size</th>
                <th>Case Qty</th>
                <th>Price/Case</th>
                <th>Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: "600" }}>{p.name}</td>
                  <td style={{ fontSize: "13px", color: "#888" }}>{p.category}</td>
                  <td>{p.packSize}</td>
                  <td>{p.caseQty}</td>
                  <td style={{ color: "#f26f21", fontWeight: "600" }}>{p.price}</td>
                  <td>
                    <span className={`badge ${p.stock === "In Stock" ? "badge-green" : p.stock === "Low Stock" ? "badge-yellow" : "badge-red"}`}>
                      {p.stock}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: "8px" }}>
                    <button style={{ background: "#e0f2fe", color: "#0369a1", border: "none", borderRadius: "4px", padding: "6px 10px", fontSize: "12px", cursor: "pointer" }}>
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      style={{ background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: "4px", padding: "6px 10px", fontSize: "12px", cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Footer />
    </>
  );
}
