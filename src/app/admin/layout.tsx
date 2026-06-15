import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import Link from "next/link";

export const metadata = {
  title: "Admin | Room Ready Supply",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <div style={{ background: "#0f2b57", padding: "0 40px", display: "flex", alignItems: "center", height: "64px" }}>
        <Link href="/" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: "13px" }}>
          ← Back to Site
        </Link>
        <span style={{ color: "white", fontWeight: "700", fontSize: "18px", marginLeft: "auto", marginRight: "auto" }}>
          Room Ready Supply — Admin
        </span>
      </div>
      <div className="dashboard-layout">
        <AdminSidebar />
        {children}
      </div>
      <Footer />
    </>
  );
}
