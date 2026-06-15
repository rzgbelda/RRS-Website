import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Room Ready Supply | Hospitality & Facility Supplies",
    template: "%s | Room Ready Supply",
  },
  description:
    "Room Ready Supply helps hotels, motels, short-term rentals, cleaning companies, and facilities order the everyday supplies they need with simple pricing, easy reordering, and local support.",
  keywords: [
    "hospitality supplies", "hotel supplies", "motel supplies", "cleaning supplies",
    "bulk supplies", "case pricing", "auto reorder", "facility supplies",
  ],
  metadataBase: new URL("https://roomreadysupply.com"),
  openGraph: {
    type: "website",
    siteName: "Room Ready Supply",
    title: "Room Ready Supply | Hospitality & Facility Supplies",
    description:
      "Commercial-grade hospitality supplies at case pricing. Automated reorders, local support, simple ordering.",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Room Ready Supply" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Room Ready Supply",
    description: "Commercial-grade hospitality supplies at case pricing.",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
