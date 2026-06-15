import { MetadataRoute } from "next";

const BASE = "https://roomreadysupply.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, lastModified: new Date(), priority: 1.0 },
    { url: `${BASE}/catalog`, lastModified: new Date(), priority: 0.9 },
    { url: `${BASE}/how-it-works`, lastModified: new Date(), priority: 0.8 },
    { url: `${BASE}/about`, lastModified: new Date(), priority: 0.7 },
    { url: `${BASE}/contact`, lastModified: new Date(), priority: 0.7 },
    { url: `${BASE}/business-pricing`, lastModified: new Date(), priority: 0.8 },
    { url: `${BASE}/auto-reorder`, lastModified: new Date(), priority: 0.7 },
    { url: `${BASE}/privacy`, lastModified: new Date(), priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: new Date(), priority: 0.3 },
    { url: `${BASE}/login`, lastModified: new Date(), priority: 0.5 },
    { url: `${BASE}/register`, lastModified: new Date(), priority: 0.5 },
  ];
}
