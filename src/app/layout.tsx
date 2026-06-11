import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Room Ready Supply | Hospitality & Facility Supplies",
  description:
    "Room Ready Supply helps hotels, motels, short-term rentals, cleaning companies, and facilities order the everyday supplies they need with simple pricing, easy reordering, and local support.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
