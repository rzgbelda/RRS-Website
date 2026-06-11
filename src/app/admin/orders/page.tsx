"use client";

import { useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";

const ORDERS = [
  { id: "ORD-041", biz: "Blue Heron Hotel", contact: "Maria Chen", items: "Toilet Paper, Hand Soap x4", status: "New", date: "2024-05-14", total: "$480", type: "One-Time" },
  { id: "ORD-040", biz: "Sunrise Motel", contact: "Tom Jacobs", items: "Paper Towels x2", status: "Confirmed", date: "2024-05-13", total: "$195", type: "Reorder" },
  { id: "ORD-039", biz: "Clean & Fresh Co.", contact: "Priya Sharma", items: "Cleaning Chem., Trash Liners x6", status: "Delivered", date: "2024-05-12", total: "$860", type: "Reorder" },
  { id: "ORD-038", biz: "Lakeside Cabins", contact: "Dave Wilson", items: "Guest Room Supplies x3", status: "Confirmed", date: "2024-05-11", total: "$320", type: "One-Time" },
  { id: "ORD-037", biz: "Meadow RV Park", contact: "Susan Park", items: "Hand Soap, Trash Liners x5", status: "Delivered", date: "2024-05-10", total: "$275", type: "Reorder" },
];

const STATUS_COLORS: Record<string, string> = {
  New: "badge-yellow",
  Confirmed: "badge-blue",
  Delivered: "badge-green",
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState(ORDERS);
  const [filter, setFilter] = useState("All");

  const filtered = filter === "All" ? orders : orders.filter((o) => o.status === filter);

  const updateStatus = (id: string, newStatus: string) => {
    setOrders(orders.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));
  };

  return (
    <>
      <TopBar />
      <div style={{ background: "#0f2b57", padding: "0 40px", display: "flex", alignItems: "center", height: "64px" }}>
        <Link href="/admin" style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none", fontSize: "14px" }}>
          ← Admin Overview
        </Link>
        <span style={{ color: "white", fontWeight: "700", fontSize: "18px", marginLeft: "24px" }}>
          🧾 Orders
        </span>
      </div>

      <div className="dashboard-content" style={{ padding: "32px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h1 className="dashboard-title" style={{ margin: 0 }}>Order Management</h1>
          <div style={{ display: "flex", gap: "8px" }}>
            {["All", "New", "Confirmed", "Delivered"].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid",
                  borderColor: filter === s ? "#f26f21" : "#e5e7eb",
                  background: filter === s ? "#fff8f4" : "white",
                  color: filter === s ? "#f26f21" : "#555",
                  cursor: "pointer",
                  fontWeight: filter === s ? "600" : "400",
                  fontSize: "14px",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="data-table">
          <h2>Orders ({filtered.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Business</th>
                <th>Contact</th>
                <th>Items</th>
                <th>Total</th>
                <th>Type</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: "600", color: "#f26f21" }}>{o.id}</td>
                  <td style={{ fontWeight: "600" }}>{o.biz}</td>
                  <td style={{ fontSize: "13px", color: "#666" }}>{o.contact}</td>
                  <td style={{ fontSize: "13px" }}>{o.items}</td>
                  <td style={{ fontWeight: "600" }}>{o.total}</td>
                  <td>
                    <span style={{ fontSize: "12px", color: o.type === "Reorder" ? "#1e40af" : "#555" }}>
                      {o.type}
                    </span>
                  </td>
                  <td style={{ fontSize: "13px", color: "#888" }}>{o.date}</td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[o.status]}`}>{o.status}</span>
                  </td>
                  <td>
                    <select
                      value={o.status}
                      onChange={(e) => updateStatus(o.id, e.target.value)}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "4px",
                        padding: "4px 8px",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      <option>New</option>
                      <option>Confirmed</option>
                      <option>Delivered</option>
                    </select>
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
