import Link from "next/link";

const RECENT_ORDERS = [
  { id: "ORD-041", biz: "Blue Heron Hotel", items: 4, status: "New", date: "2024-05-14", total: "$480" },
  { id: "ORD-040", biz: "Sunrise Motel", items: 2, status: "Confirmed", date: "2024-05-13", total: "$195" },
  { id: "ORD-039", biz: "Clean & Fresh Co.", items: 6, status: "Delivered", date: "2024-05-12", total: "$860" },
  { id: "ORD-038", biz: "Lakeside Cabins", items: 3, status: "Confirmed", date: "2024-05-11", total: "$320" },
];

const RECENT_QUOTES = [
  { id: "QT-022", biz: "Grand Vista Hotel", type: "Hotel", status: "New", date: "2024-05-14" },
  { id: "QT-021", biz: "SparkClean Services", type: "Cleaning Company", status: "Under Review", date: "2024-05-13" },
  { id: "QT-020", biz: "Pine Ridge RV Park", type: "RV Park", status: "Completed", date: "2024-05-10" },
];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    New: "badge-yellow",
    Confirmed: "badge-blue",
    Delivered: "badge-green",
    "Under Review": "badge-yellow",
    Completed: "badge-green",
  };
  return map[s] || "badge-blue";
};

export const metadata = { title: "Admin Overview | Room Ready Supply" };

export default function AdminPage() {
  return (
    <main className="dashboard-content">
      <h1 className="dashboard-title">Admin Overview</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Orders</div>
          <div className="value">41</div>
        </div>
        <div className="stat-card">
          <div className="label">New Orders</div>
          <div className="value accent">3</div>
        </div>
        <div className="stat-card">
          <div className="label">Active Customers</div>
          <div className="value">28</div>
        </div>
        <div className="stat-card">
          <div className="label">Pending Quotes</div>
          <div className="value accent">5</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <div className="data-table">
          <h2>Recent Orders</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Business</th><th>Total</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_ORDERS.map((o) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: "600", color: "#f26f21", fontSize: "12px" }}>{o.id}</td>
                  <td style={{ fontSize: "13px" }}>{o.biz}</td>
                  <td style={{ fontSize: "13px" }}>{o.total}</td>
                  <td><span className={`badge ${statusBadge(o.status)}`}>{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="data-table">
          <h2>Recent Quote Requests</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Business</th><th>Type</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_QUOTES.map((q) => (
                <tr key={q.id}>
                  <td style={{ fontWeight: "600", color: "#f26f21", fontSize: "12px" }}>{q.id}</td>
                  <td style={{ fontSize: "13px" }}>{q.biz}</td>
                  <td style={{ fontSize: "13px" }}>{q.type}</td>
                  <td><span className={`badge ${statusBadge(q.status)}`}>{q.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" }}>
        <Link href="/admin/products" className="btn-primary" style={{ textAlign: "center", padding: "16px" }}>
          + Add Product
        </Link>
        <Link href="/admin/orders" className="btn-secondary" style={{ textAlign: "center", padding: "16px" }}>
          View All Orders
        </Link>
        <Link href="/admin/quotes" className="btn-secondary" style={{ textAlign: "center", padding: "16px" }}>
          Review Quotes
        </Link>
      </div>
    </main>
  );
}
