"use client";

import { useState } from "react";

const QUOTES = [
  { id: "QT-022", biz: "Grand Vista Hotel", type: "Hotel", contact: "James Taylor", email: "jtaylor@grandvista.com", usage: "$1,200/mo", supplier: "Sysco", status: "New", date: "2024-05-14" },
  { id: "QT-021", biz: "SparkClean Services", type: "Cleaning Company", contact: "Ana Reyes", email: "ana@sparkclean.com", usage: "$600/mo", supplier: "None", status: "Under Review", date: "2024-05-13" },
  { id: "QT-020", biz: "Pine Ridge RV Park", type: "RV Park", contact: "Carl Hughes", email: "carl@pineridge.com", usage: "$350/mo", supplier: "Local distributor", status: "Completed", date: "2024-05-10" },
  { id: "QT-019", biz: "Coastal Airbnb Mgmt", type: "Short-Term Rental", contact: "Lisa Wong", email: "lisa@coastalbnb.com", usage: "$450/mo", supplier: "Amazon", status: "New", date: "2024-05-09" },
];

const STATUS_COLORS: Record<string, string> = {
  New: "badge-yellow",
  "Under Review": "badge-blue",
  Completed: "badge-green",
};

export default function AdminQuotesPage() {
  const [quotes, setQuotes] = useState(QUOTES);

  const updateStatus = (id: string, status: string) =>
    setQuotes(quotes.map((q) => (q.id === id ? { ...q, status } : q)));

  return (
    <main className="dashboard-content">
      <h1 className="dashboard-title">Quote Request Management</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Quotes</div>
          <div className="value">{quotes.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">New</div>
          <div className="value accent">{quotes.filter((q) => q.status === "New").length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Under Review</div>
          <div className="value">{quotes.filter((q) => q.status === "Under Review").length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Completed</div>
          <div className="value">{quotes.filter((q) => q.status === "Completed").length}</div>
        </div>
      </div>

      <div className="data-table">
        <h2>All Quote Requests</h2>
        <table>
          <thead>
            <tr>
              <th>Quote ID</th><th>Business</th><th>Type</th><th>Contact</th><th>Email</th>
              <th>Monthly Usage</th><th>Current Supplier</th><th>Date</th><th>Status</th><th>Update</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id}>
                <td style={{ fontWeight: "600", color: "#f26f21" }}>{q.id}</td>
                <td style={{ fontWeight: "600" }}>{q.biz}</td>
                <td style={{ fontSize: "13px", color: "#888" }}>{q.type}</td>
                <td style={{ fontSize: "13px" }}>{q.contact}</td>
                <td style={{ fontSize: "13px", color: "#28476a" }}>{q.email}</td>
                <td style={{ fontWeight: "600", color: "#f26f21" }}>{q.usage}</td>
                <td style={{ fontSize: "13px", color: "#666" }}>{q.supplier}</td>
                <td style={{ fontSize: "13px", color: "#888" }}>{q.date}</td>
                <td><span className={`badge ${STATUS_COLORS[q.status]}`}>{q.status}</span></td>
                <td>
                  <select value={q.status} onChange={(e) => updateStatus(q.id, e.target.value)}
                    style={{ border: "1px solid #e5e7eb", borderRadius: "4px", padding: "4px 8px", fontSize: "12px" }}>
                    <option>New</option>
                    <option>Under Review</option>
                    <option>Completed</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
