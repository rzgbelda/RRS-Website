import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AccountSidebar from "@/components/AccountSidebar";

export const metadata = {
  title: "My Account | Room Ready Supply",
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <Navbar />
      <div className="dashboard-layout">
        <AccountSidebar />
        {children}
      </div>
      <Footer />
    </>
  );
}
