"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "My Orders", icon: "📦" },
  { href: "/auto-reorder", label: "Reorder Program", icon: "🔄" },
  { href: "/business-pricing", label: "Request Pricing", icon: "📄" },
  { href: "/catalog", label: "Shop Catalog", icon: "🛍️" },
];

interface AccountSidebarProps {
  businessName?: string;
}

export default function AccountSidebar({ businessName = "My Account" }: AccountSidebarProps) {
  const path = usePathname();

  return (
    <aside className="sidebar-nav" aria-label="Account navigation">
      <div className="sidebar-label">Customer Portal</div>
      <div className="sidebar-biz-name">{businessName}</div>
      {NAV.map((item) => {
        const active = path === item.href || path.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
      <div className="sidebar-new-order">
        <Link href="/catalog" className="btn-primary" style={{ fontSize: "13px", padding: "12px 16px", display: "block", textAlign: "center" }}>
          + New Order
        </Link>
      </div>
    </aside>
  );
}
