"use client";

import { useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const TABS = ["Orders", "Supply Lists", "Reorders", "Quote Requests"];

const MOCK_ORDERS = [
  { id: "ORD-001", date: "2024-05-10", items: "Toilet Paper, Hand Soap", status: "Confirmed", total: "~$340" },
  { id: "ORD-002", date: "2024-04-15", items: "Paper Towels, Trash Liners", status: "Delivered", total: "~$185" },
  { id: "ORD-003", date: "2024-03-20", items: "Cleaning Chemicals", status: "Delivered", total: "~$220" },
];

const MOCK_REORDERS = [
  { id: "REO-001", products: "Toilet Paper, Soap", frequency: "Monthly", nextDate: "2024-06-10", status: "Active" },
  { id: "REO-002", products: "Paper Towels", frequency: "Every 2 Weeks", nextDate: "2024-05-28", status: "Active" },
];

const MOCK_QUOTES = [
  { id: "QT-001", date: "2024-05-08", business: "Sunshine Motel", status: "Under Review", usage: "$800/month" },
  { id: "QT-002", date: "2024-04-01", business: "Sunshine Motel", status: "Completed", usage: "$600/month" },
];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    Confirmed: "badge-blue",
    Delivered: "badge-green",
    Active: "badge-green",
    "Under Review": "badge-yellow",
    Completed: "badge-green",
    Pending: "badge-yellow",
  };
  return map[s] || "badge-blue";
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("Orders");

  return (
    <>
      <TopBar />
      <Navbar />

      <div className="dashboard-layout">
        <aside className="sidebar-nav">
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              marginBottom: "8px",
            }}
          >
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px" }}>
              Customer Portal
            </p>
            <p style={{ color: "white", fontSize: "15px", fontWeight: "600", marginTop: "4px" }}>
              Sunshine Motel
            </p>
          </div>
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 24px",
                color: activeTab === tab ? "white" : "rgba(255,255,255,0.7)",
                background: activeTab === tab ? "rgba(255,255,255,0.1)" : "none",
                borderLeft: activeTab === tab ? "3px solid #f26f21" : "3px solid transparent",
                fontSize: "14px",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                border: "none",
                transition: "all 0.2s",
                fontWeight: activeTab === tab ? "600" : "400",
              }}
            >
              {tab === "Orders" && "📦 "}
              {tab === "Supply Lists" && "📋 "}
              {tab === "Reorders" && "🔄 "}
              {tab === "Quote Requests" && "📄 "}
              {tab}
            </button>
          ))}
          <div style={{ padding: "24px", marginTop: "auto" }}>
            <Link href="/catalog" className="btn-primary" style={{ fontSize: "13px", padding: "12px 16px", display: "block", textAlign: "center" }}>
              + New Order
            </Link>
          </div>
        </aside>

        <main className="dashboard-content">
          <h1 className="dashboard-title">{activeTab}</h1>

          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="label">Total Orders</div>
              <div className="value">12</div>
            </div>
            <div className="stat-card">
              <div className="label">Active Reorders</div>
              <div className="value accent">2</div>
            </div>
            <div className="stat-card">
              <div className="label">Quote Requests</div>
              <div className="value">3</div>
            </div>
            <div className="stat-card">
              <div className="label">Next Reorder</div>
              <div className="value" style={{ fontSize: "20px" }}>May 28</div>
            </div>
          </div>

          {activeTab === "Orders" && (
            <div className="data-table">
              <h2>Order History</h2>
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Date</th>
                    <th>Items</th>
                    <th>Est. Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_ORDERS.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: "600", color: "#f26f21" }}>{o.id}</td>
                      <td>{o.date}</td>
                      <td>{o.items}</td>
                      <td>{o.total}</td>
                      <td>
                        <span className={`badge ${statusBadge(o.status)}`}>{o.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "Supply Lists" && (
            <div className="data-table">
              <h2>My Supply Lists</h2>
              <div style={{ padding: "48px", textAlign: "center", color: "#888" }}>
                <p style={{ fontSize: "18px", marginBottom: "16px" }}>No supply lists yet.</p>
                <p style={{ fontSize: "14px", marginBottom: "24px" }}>
                  Browse the catalog and add items to build your supply list.
                </p>
                <Link href="/catalog" className="btn-primary">
                  Browse Catalog
                </Link>
              </div>
            </div>
          )}

          {activeTab === "Reorders" && (
            <div className="data-table">
              <h2>Active Reorder Schedules</h2>
              <table>
                <thead>
                  <tr>
                    <th>Schedule ID</th>
                    <th>Products</th>
                    <th>Frequency</th>
                    <th>Next Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_REORDERS.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: "600", color: "#f26f21" }}>{r.id}</td>
                      <td>{r.products}</td>
                      <td>{r.frequency}</td>
                      <td>{r.nextDate}</td>
                      <td>
                        <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                      </td>
                      <td>
                        <button
                          style={{
                            background: "none",
                            border: "1px solid #e5e7eb",
                            borderRadius: "4px",
                            padding: "4px 10px",
                            fontSize: "12px",
                            cursor: "pointer",
                            color: "#555",
                          }}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb" }}>
                <Link href="/auto-reorder" style={{ color: "#f26f21", fontSize: "14px", fontWeight: "600" }}>
                  + Add New Reorder Schedule
                </Link>
              </div>
            </div>
          )}

          {activeTab === "Quote Requests" && (
            <div className="data-table">
              <h2>Business Quote Requests</h2>
              <table>
                <thead>
                  <tr>
                    <th>Quote ID</th>
                    <th>Date</th>
                    <th>Business</th>
                    <th>Est. Monthly Usage</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_QUOTES.map((q) => (
                    <tr key={q.id}>
                      <td style={{ fontWeight: "600", color: "#f26f21" }}>{q.id}</td>
                      <td>{q.date}</td>
                      <td>{q.business}</td>
                      <td>{q.usage}</td>
                      <td>
                        <span className={`badge ${statusBadge(q.status)}`}>{q.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb" }}>
                <Link href="/business-pricing" style={{ color: "#f26f21", fontSize: "14px", fontWeight: "600" }}>
                  + New Quote Request
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>

      <Footer />
    </>
  );
}
