"use client";

import Link from "next/link";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";

const CUSTOMERS = [
  { id: "C-001", biz: "Blue Heron Hotel", type: "Hotel", contact: "Maria Chen", email: "m.chen@blueheronhotel.com", phone: "(555) 120-3456", orders: 8, reorders: 1, totalSpend: "$3,840" },
  { id: "C-002", biz: "Sunrise Motel", type: "Motel", contact: "Tom Jacobs", email: "tom@sunrisemotel.com", phone: "(555) 234-5678", orders: 12, reorders: 2, totalSpend: "$5,220" },
  { id: "C-003", biz: "Clean & Fresh Co.", type: "Cleaning Company", contact: "Priya Sharma", email: "priya@cleanfresh.com", phone: "(555) 345-6789", orders: 6, reorders: 3, totalSpend: "$8,400" },
  { id: "C-004", biz: "Lakeside Cabins", type: "Short-Term Rental", contact: "Dave Wilson", email: "dave@lakesidecabins.com", phone: "(555) 456-7890", orders: 4, reorders: 0, totalSpend: "$1,280" },
  { id: "C-005", biz: "Meadow RV Park", type: "RV Park", contact: "Susan Park", email: "susan@meadowrv.com", phone: "(555) 567-8901", orders: 9, reorders: 2, totalSpend: "$2,475" },
  { id: "C-006", biz: "Harbor View Restaurant", type: "Restaurant", contact: "Chef André", email: "andre@harborview.com", phone: "(555) 678-9012", orders: 3, reorders: 1, totalSpend: "$1,560" },
];

export default function AdminCustomersPage() {
  return (
    <>
      <TopBar />
      <div style={{ background: "#0f2b57", padding: "0 40px", display: "flex", alignItems: "center", height: "64px" }}>
        <Link href="/admin" style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none", fontSize: "14px" }}>
          ← Admin Overview
        </Link>
        <span style={{ color: "white", fontWeight: "700", fontSize: "18px", marginLeft: "24px" }}>
          👥 Customers
        </span>
      </div>

      <div className="dashboard-content" style={{ padding: "32px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h1 className="dashboard-title" style={{ margin: 0 }}>Customer Management</h1>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              placeholder="Search customers..."
              style={{ border: "1px solid #e5e7eb", borderRadius: "6px", padding: "8px 14px", fontSize: "14px", width: "240px" }}
            />
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="label">Total Customers</div>
            <div className="value">{CUSTOMERS.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">With Active Reorders</div>
            <div className="value accent">{CUSTOMERS.filter((c) => c.reorders > 0).length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Avg Orders / Customer</div>
            <div className="value">{Math.round(CUSTOMERS.reduce((s, c) => s + c.orders, 0) / CUSTOMERS.length)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Total Revenue</div>
            <div className="value" style={{ fontSize: "20px" }}>$22,775</div>
          </div>
        </div>

        <div className="data-table">
          <h2>All Customers ({CUSTOMERS.length})</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Business</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Orders</th>
                <th>Reorders</th>
                <th>Total Spend</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {CUSTOMERS.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontSize: "12px", color: "#888" }}>{c.id}</td>
                  <td style={{ fontWeight: "600" }}>{c.biz}</td>
                  <td style={{ fontSize: "13px", color: "#888" }}>{c.type}</td>
                  <td style={{ fontSize: "13px" }}>{c.contact}</td>
                  <td style={{ fontSize: "13px", color: "#28476a" }}>{c.email}</td>
                  <td style={{ fontSize: "13px" }}>{c.phone}</td>
                  <td style={{ textAlign: "center" }}>{c.orders}</td>
                  <td style={{ textAlign: "center" }}>
                    <span className={`badge ${c.reorders > 0 ? "badge-green" : "badge-yellow"}`}>
                      {c.reorders} active
                    </span>
                  </td>
                  <td style={{ fontWeight: "600", color: "#f26f21" }}>{c.totalSpend}</td>
                  <td>
                    <button
                      style={{
                        background: "#dbeafe",
                        color: "#1e40af",
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px 10px",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      View
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
