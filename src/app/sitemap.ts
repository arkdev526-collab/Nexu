import type { MetadataRoute } from "next";
import { site } from "@/data/products";

const routes = ["", "/nexunotepad", "/nexuclean", "/downloads", "/support"];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${site.url}${route}`,
    lastModified: new Date("2026-05-05"),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.8,
  }));
}
