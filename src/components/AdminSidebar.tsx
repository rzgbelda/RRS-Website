"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Overview", icon: "📊" },
  { href: "/admin/products", label: "Products", icon: "📦" },
  { href: "/admin/orders", label: "Orders", icon: "🧾" },
  { href: "/admin/quotes", label: "Quotes", icon: "📄" },
  { href: "/admin/customers", label: "Customers", icon: "👥" },
  { href: "/admin/reorders", label: "Reorders", icon: "🔄" },
];

export default function AdminSidebar() {
  const path = usePathname();

  return (
    <aside className="sidebar-nav" aria-label="Admin navigation">
      <div className="sidebar-label">Admin Panel</div>
      {NAV.map((item) => {
        const active = path === item.href || (item.href !== "/admin" && path.startsWith(item.href));
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
    </aside>
  );
}
