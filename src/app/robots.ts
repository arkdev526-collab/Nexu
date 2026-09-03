import type { MetadataRoute } from "next";
import { site } from "@/data/products";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Seller-private and administrative areas — nothing here belongs in an index.
      disallow: [
        "/api/",
        "/mintedup/admin",
        "/mintedup/dashboard",
        "/mintedup/sell",
        "/mintedup/signin",
      ],
    },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
