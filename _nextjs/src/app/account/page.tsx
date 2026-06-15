export const metadata = {
  title: "My Account | Room Ready Supply",
};

export default function AccountPage() {
  return (
    <main className="dashboard-content">
      <h1 className="dashboard-title">My Account</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Orders</div>
          <div className="value">0</div>
        </div>
        <div className="stat-card">
          <div className="label">Active Reorders</div>
          <div className="value accent">0</div>
        </div>
        <div className="stat-card">
          <div className="label">Pending Quotes</div>
          <div className="value">0</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Spent</div>
          <div className="value" style={{ fontSize: "20px" }}>$0.00</div>
        </div>
      </div>

      <div className="data-table">
        <h2>Recent Orders</h2>
        <div style={{ padding: "40px", textAlign: "center", color: "#aaa" }}>
          No orders yet. <a href="/catalog" style={{ color: "#f26f21" }}>Browse the catalog</a> to place your first order.
        </div>
      </div>
    </main>
  );
}
