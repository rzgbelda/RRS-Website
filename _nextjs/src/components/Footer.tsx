import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer-bar">
      <p>© {new Date().getFullYear()} Room Ready Supply. All rights reserved.</p>
      <div className="footer-right">
        <span>📞 (123)-456-789</span>
        <span>✉ roomready@email.com</span>
        <Link href="/admin" style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
          Admin
        </Link>
      </div>
    </footer>
  );
}
