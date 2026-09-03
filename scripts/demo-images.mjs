/**
 * Populate the seeded demo lots with catalogue plates.
 *
 *   npm i -D playwright && npx playwright install chromium   # once
 *   npm run dev                                              # in another shell
 *   npm run demo:images
 *
 * The plates are drawn, not photographed — see demo-art.mjs. They are rendered
 * at 3000x2000 and uploaded through the ordinary image endpoint, so they are
 * graded by the same standard as a seller's own photographs and are rejected if
 * they miss it. Nothing here bypasses the gate.
 *
 * Playwright is an optional dev dependency, used only as a renderer. It is not
 * needed to run Minted Up.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as art from "./demo-art.mjs";

const BASE = process.env.MINTEDUP_URL ?? "http://localhost:3000";
const SELLER = { email: "dealer@mintedup.example", password: "dealer-demo-2026" };

/** Overall plate first, then the detail a buyer actually zooms into. */
const LOTS = [
  { match: "card table", plates: ["cardTable", "timberDetail"] },
  { match: "christening mug", plates: ["silverMug", "silverMarks"] },
  { match: "stoneware bowl", plates: ["stonewareBowl", "potterySeal"] },
  { match: "etching", plates: ["etching"] },
];

const GROUNDS = {
  timberDetail: { ground: "#6d2f1d" },
  silverMarks: { ground: "#b4b9be" },
  potterySeal: { ground: "#6c6247" },
  etching: { ground: "#b9b2a4" },
  swordsMark: { ground: "#e8ebe8" },
};

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "This script renders with Playwright, which is optional:\n" +
      "  npm i -D playwright && npx playwright install chromium",
  );
  process.exit(1);
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "mintedup-plates-"));
const browser = await chromium.launch({
  // Honour a pre-installed browser where one is provided.
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const renderer = await browser.newPage({ viewport: { width: 3000, height: 2000 } });

async function render(name) {
  await renderer.setContent(art.scene(art[name], GROUNDS[name] ?? {}), { waitUntil: "load" });
  const file = path.join(outDir, `${name}.jpg`);
  await renderer.screenshot({ path: file, type: "jpeg", quality: 98 });
  return file;
}

async function main() {
  const page = await browser.newPage();
  await page.goto(`${BASE}/mintedup/signin`);
  await page.fill("#email", SELLER.email);
  await page.fill("#password", SELLER.password);
  await page.click('form button[type="submit"]');
  await page.waitForURL("**/mintedup/dashboard", { timeout: 30000 });

  const { listings } = await (await page.request.get(`${BASE}/api/mintedup/listings`)).json();

  for (const lot of LOTS) {
    const listing = listings.find((l) => l.title.toLowerCase().includes(lot.match));
    if (!listing) {
      console.log(`  no seeded lot matching "${lot.match}" — skipped`);
      continue;
    }
    for (const [slot, plate] of lot.plates.entries()) {
      const file = await render(plate);
      const response = await page.request.post(`${BASE}/api/mintedup/images`, {
        multipart: {
          file: { name: `${plate}.jpg`, mimeType: "image/jpeg", buffer: fs.readFileSync(file) },
          listingId: listing.id,
          slot: String(slot),
          // Drawn plates are perfectly in focus; the server still measures the rest.
          sharpness: "78",
        },
      });
      const body = await response.json();
      if (response.status() !== 201) {
        console.log(`  rejected ${plate}: ${(body.quality?.failures ?? [body.error]).join(" ")}`);
        continue;
      }
      console.log(
        `  ${listing.title.slice(0, 40).padEnd(42)} slot ${slot}  ${body.quality.megapixels}MP  score ${body.quality.score}/100`,
      );
    }
  }
  await browser.close();
  fs.rmSync(outDir, { recursive: true, force: true });
}

await main();
