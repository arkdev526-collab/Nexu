import type { MetadataRoute } from "next";
import { site } from "@/data/products";
import { CATEGORIES } from "@/mintedup/categories";
import { read } from "@/mintedup/store";

// Minted Up listings change constantly, so the sitemap is generated per request
// rather than baked at build time.
export const dynamic = "force-dynamic";

const nexuRoutes = ["", "/nexunotepad", "/nexuclean", "/downloads", "/support"];

const mintedUpRoutes = [
  "/mintedup",
  "/mintedup/browse",
  "/mintedup/research",
  "/mintedup/standards",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = nexuRoutes.map((route) => ({
    url: `${site.url}${route}`,
    lastModified: new Date("2026-05-05"),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.8,
  }));

  for (const route of mintedUpRoutes) {
    entries.push({
      url: `${site.url}${route}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: route === "/mintedup" ? 0.9 : 0.7,
    });
  }

  for (const category of CATEGORIES) {
    entries.push({
      url: `${site.url}/mintedup/browse?category=${category.id}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  // Live lots and shopfronts. A marketplace that hides these from crawlers is
  // throwing away the traffic the AI SEO fields exist to earn.
  const { listings, shops } = await read((db) => ({
    listings: db.listings
      .filter((l) => l.status === "active")
      .map((l) => ({ id: l.id, updatedAt: l.updatedAt })),
    shops: db.users.filter((u) => !u.suspended).map((u) => u.shop.slug),
  }));

  for (const listing of listings) {
    entries.push({
      url: `${site.url}/mintedup/listing/${listing.id}`,
      lastModified: new Date(listing.updatedAt),
      changeFrequency: "daily",
      priority: 0.8,
    });
  }

  for (const slug of shops) {
    entries.push({
      url: `${site.url}/mintedup/shop/${slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return entries;
}
