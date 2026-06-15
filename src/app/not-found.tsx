import Link from "next/link";
import TopBar from "@/components/TopBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function NotFound() {
  return (
    <>
      <TopBar />
      <Navbar />
      <div className="not-found-page">
        <div className="not-found-code">404</div>
        <h1 className="not-found-title">Page Not Found</h1>
        <p className="not-found-msg">The page you are looking for does not exist or has been moved.</p>
        <div className="not-found-actions">
          <Link href="/" className="btn-primary">Go Home</Link>
          <Link href="/catalog" className="btn-secondary">Browse Catalog</Link>
        </div>
      </div>
      <Footer />
    </>
  );
}
