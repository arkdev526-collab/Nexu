# Minted Up

A marketplace and research gateway for antiques and collectibles. It lives inside the
Nexu Apps Next.js app under `/mintedup`, with its own chrome, theme and data — nothing
is shared with the Nexu marketing site except the framework.

## What is here

| Area | Route | Notes |
| --- | --- | --- |
| Home | `/mintedup` | Three doors: buy it, bid it, research it |
| Catalogue | `/mintedup/browse` | Category, format, search and sort |
| Lot | `/mintedup/listing/[id]` | Gallery, condition report, buy/bid panel |
| Listing composer | `/mintedup/sell` | 30 image slots, AI SEO buttons, beta auto-complete |
| Research gateway | `/mintedup/research` | The learning engine, described below |
| Seller dashboard | `/mintedup/dashboard` | Listings, bids, sales, saved research |
| Shop settings | `/mintedup/dashboard/shop` | Shopfront, specialisms, policies |
| Shopfront | `/mintedup/shop/[slug]` | The seller's public page |
| Admin | `/mintedup/admin` | Sellers, listings, research corpus, learning telemetry |
| Standards | `/mintedup/standards` | The photography standard and how the learning works |

## Running it

```bash
npm install
npm run dev            # http://localhost:3000/mintedup
```

The database seeds itself on first request: a curated research corpus, two demo accounts
and four listings. Demo credentials are printed on `/mintedup/signin` — **delete them
before going live.**

Optional:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # turns on the real AI SEO and auto-complete
export MINTEDUP_DATA_DIR=/var/lib/mintedup   # defaults to ./.data/mintedup
```

Without an API key the AI features fall back to a deterministic local generator built
from the fields the seller has filled in, and say so in the UI. Everything else works.

## Architecture

```
src/mintedup/            domain layer, no React
  types.ts               every entity
  store.ts               JSON store: read() / mutate(), atomic writes, serialised
  auth.ts                scrypt passwords, HttpOnly session cookies, roles
  categories.ts          the taxonomy — antiques and collectibles only
  images.ts              the high-end image gate
  listings.ts            proxy auctions, buy-it-now, publish, settlement
  research.ts            the learning engine
  ai.ts                  Claude integration + local fallbacks
  seed.ts                first-run corpus and demo data
src/app/mintedup/        pages and co-located components
src/app/api/mintedup/    route handlers
```

### Storage

`store.ts` is a file-backed JSON store with write-then-rename persistence and a
process-wide write queue, so two concurrent bids cannot interleave. It is deliberately
the only file that touches the filesystem: **swapping it for Postgres, SQLite or Prisma
means reimplementing `read()` and `mutate()` and nothing else.** Do that before you have
real traffic — the current store keeps the whole database in memory and rewrites the
whole file on every write, which is fine for a demo and wrong for a business.

### The image gate

Minted Up accepts high-end photography only, and enforces it by measurement rather than
by asking politely:

- **In the browser** (`_components/imageClient.ts`): a Laplacian variance over a
  downscaled greyscale copy, normalised to 0-100, gives a focus score before the file is
  uploaded.
- **On the server** (`images.ts`): dimensions and format are read straight from the file
  header — JPEG SOF markers, PNG IHDR, WebP VP8/VP8L/VP8X — with no image library and no
  decode. Resolution, megapixels, file weight and *bytes per pixel* are checked against
  published thresholds.

Bytes per pixel is the interesting one: it catches an upscaled thumbnail or a photo that
has been through a messaging app, both of which pass a naive resolution check while
having already lost the detail a buyer zooms into.

A rejected file is never written to disk, and the seller is shown exactly which rule it
missed and by how much. Thresholds live in `IMAGE_RULES`; the tooltip text is generated
from them so guidance cannot drift from enforcement.

### Sale mechanics

Buy-it-now is immediate. Auctions are proxy auctions: the bidder enters a maximum, the
engine bids the minimum needed to keep them in front, and the maximum is never revealed.
A bid inside the last five minutes extends the lot by five minutes. A proxy bid that
authorises the reserve advances the price to the reserve, as it would in the room.
Auctions settle lazily — `settleDueAuctions()` runs on browse, listing and dashboard
views. In production, move that to a scheduled job.

### AI features

Both use the official Anthropic SDK against `claude-opus-5` with adaptive thinking and
structured outputs (Zod schemas via `zodOutputFormat`).

- **AI SEO button** — beside every text field in the composer. It rewrites one field from
  the facts the seller has already entered. The system prompt forbids inventing a maker,
  date, hallmark, provenance or material, and requires condition faults to stay in the
  copy. The suggestion is shown with its reasoning; applying it is a separate click.
- **Beta auto-complete** — reads up to 8 of the uploaded photographs and drafts the whole
  listing. It fills only fields the seller has left empty, returns a confidence figure and
  an explicit list of what it could not be sure about, and saves nothing on its own.

Fields touched by AI are recorded in `seo.aiAssistedFields` and surfaced in admin, so
AI-assisted copy is disclosable.

## Before this is a business

Ordered by how much trouble skipping it will cause:

1. **Payments.** `buyNow` and `settleAuction` create an order with status `paid` without
   taking any money. Wire in a payment processor with escrow or delayed capture.
2. **A real database.** See Storage above.
3. **Rate limiting and abuse controls** on auth, uploads, bidding and the AI endpoints.
   The AI endpoints in particular cost money per call and are currently only gated by
   "is signed in".
4. **Email** — verification, outbid notices, auction-ending notices, order confirmations.
5. **Delete the demo accounts** in `seed.ts`.
6. **Object storage** for uploads (S3 or similar) instead of the local data directory, and
   a CDN in front of `/api/mintedup/images/[filename]`.
7. **Scheduled auction settlement** rather than settling on page view.
8. **Fraud and authenticity policy** — the category that most needs it is jewellery,
   watches and militaria.

## Promoting Minted Up to its own site

It is a route group away. Move `src/app/mintedup/*` to `src/app/(mintedup)/*`, make its
layout the root, and point the domain at it. Nothing in `src/mintedup/` or the API routes
assumes the `/mintedup` prefix except the links in the pages themselves.
