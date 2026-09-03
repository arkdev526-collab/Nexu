# Minted Up

Minted Up is an invitation-only, curated marketplace and research gateway for antiques and collectibles. It lives inside the Nexu Apps Next.js application under `/mintedup`, with its own chrome, theme and data. The existing Nexu site shares the framework, not Minted Up's product surface or marketplace state.

Two rules define the marketplace: **nobody simply joins**, and **nothing publishes itself**. Sellers are admitted by invitation after curation, and every lot is reviewed before it enters the catalogue.

## What is here

| Area | Route | Notes |
| --- | --- | --- |
| Home | `/mintedup` | Buy it, bid it, research it |
| Catalogue | `/mintedup/browse` | Category, format, search and sort |
| Curated sales | `/mintedup/sales` | Scheduled auction-room style sales |
| Lot | `/mintedup/listing/[id]` | Gallery, condition report, buy/bid panel |
| Listing composer | `/mintedup/sell` | 30 image slots, AI SEO, beta auto-complete |
| Research gateway | `/mintedup/research` | Evidence-led learning engine |
| Seller dashboard | `/mintedup/dashboard` | Listings, bids, orders, fees, research |
| Shop settings | `/mintedup/dashboard/shop` | Shopfront, specialisms and policies |
| Shopfront | `/mintedup/shop/[slug]` | Seller's public page |
| Admin | `/mintedup/admin` | Accounts, listings, research and telemetry |
| Curation | `/mintedup/admin/curation` | Specialist review queue |
| Standards | `/mintedup/standards` | Photography and marketplace standards |

## Running and checking it

```bash
npm ci
npm run dev
```

Minted Up is available at `http://localhost:3000/mintedup`.

Run the complete local quality gate with:

```bash
npm run check
```

That runs lint, TypeScript checking and a production Next.js build. The repository also contains `.github/workflows/mintedup-ci.yml` so pull requests can prove the same gates in GitHub Actions.

The database seeds itself on first request with a curated research corpus, a curated sale, demo accounts and demo lots. Demo credentials are shown on `/mintedup/signin`. **Demo accounts and credentials must not ship to production.**

Optional environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export MINTEDUP_DATA_DIR=/var/lib/mintedup
```

Without an Anthropic API key, AI features use the deterministic local fallback built from seller-supplied facts. Marketplace mechanics do not depend on a remote AI service.

### Demo catalogue plates

The seeded lots can be given deliberately drawn catalogue plates:

```bash
npm i -D playwright
npx playwright install chromium
npm run demo:images
```

The plates are drawn rather than photographs so demo imagery cannot be mistaken for evidence of a real object's condition. They pass through the normal upload and image-quality gates rather than bypassing them.

## Architecture

```text
src/mintedup/
  types.ts               domain entities and state machines
  store.ts               JSON store: read/mutate, copy-on-write, atomic persistence
  auth.ts                scrypt passwords, sessions, roles, applications and invites
  categories.ts          antiques/collectibles taxonomy
  images.ts              server-side image-quality gate
  listings.ts            drafts, fixed-price reservations, proxy bidding, settlement
  orders.ts              payment finalisation boundary and unpaid-order cancellation
  membership.ts          tier entitlements and packaging
  billing.ts             idempotent fee/commission ledger
  quota.ts               metered AI features
  curation.ts            submission queue, decisions and curated sales
  curation-rules.ts      shared curation rules
  research.ts            retrieval, identification, pricing and learning events
  ai.ts                  Anthropic integration and deterministic fallback
  seed.ts                first-run demo/reference data

src/app/mintedup/         pages and co-located components
src/app/api/mintedup/     route handlers
```

The domain layer is intentionally separate from React and route handlers. Marketplace rules belong in `src/mintedup`, while HTTP handlers authenticate/validate inputs and adapt domain results to responses.

## Storage

`store.ts` is a file-backed JSON store with copy-on-write mutation, a process-wide serialised write queue, and write-then-rename persistence. A failed mutation does not leak a half-mutated in-memory database into a later write.

This is appropriate for development and a single-process prototype. It is **not** the production persistence model. Before real traffic, replace the store with a transactional database and preserve the `read()` / `mutate()` domain boundary or an equivalent repository abstraction. Local uploads must likewise move to durable object storage.

## Image standard

Minted Up deliberately refuses low-detail listing photography.

- The browser measures focus using a Laplacian-variance style score on a downscaled greyscale image.
- The server reads JPEG, PNG and WebP headers directly to verify dimensions and format.
- Resolution, megapixels, file weight and bytes-per-pixel are checked against shared thresholds.
- A rejected upload is not written to disk.
- Seller guidance is generated from the same thresholds used for enforcement.

Bytes-per-pixel is an additional heuristic for images that have nominally large dimensions but have already lost substantial detail through aggressive recompression or naive upscaling. It is a quality signal, not a substitute for visual inspection or provenance.

## Membership and curation

The intended path is:

```text
apply
  -> curator review
  -> single-use invitation bound to one email address
  -> registration
  -> free approved member
  -> optional shop membership
```

Current product packaging:

| | Free member | Shop member |
| --- | --- | --- |
| Cost | £0, invitation required | £20/month |
| Listings | 5 included, then 5p each | Unlimited, listing fee waived |
| Commission | 1% of confirmed sale value | 1% of confirmed sale value |
| AI SEO / auto-complete | Metered | Unlimited |
| Boosted lots | — | 3 at a time |
| Curation queue | Standard | Priority |
| Extras | — | Verified badge, analytics, shop customisation, longer sales |

`membership.ts` is the packaging authority. `billing.ts` is the fee-ledger authority.

A listing moves through the controlled lifecycle:

```text
draft -> submitted -> active -> reserved -> sold
              |          |          |
              |          |          +-> cancelled payment: active or ended
              |          +-> auction no-sale: ended
              +-> changes / rejected
```

Once a listing enters curation or commerce, the seller cannot silently edit its factual content. It must return through the appropriate curation state before seller edits resume.

## Trust Core: payment truthfulness

Minted Up must never describe a button click as money received.

`buyNow()` and auction settlement therefore create an order with `status: "awaiting_payment"` and move the lot to `reserved`. They **do not**:

- mark the order paid;
- mark the lot sold;
- post commission;
- publish a realised market price to the research engine.

`src/mintedup/orders.ts` is the payment finalisation boundary. `confirmOrderPayment()` is the operation that can move an unpaid order to `paid`, mark the listing sold, post commission and publish the realised outcome to the research corpus.

The transition is designed to be retry-safe. Commission is deduplicated by order ID, listing fees are deduplicated by listing ID, and an already-recorded identical realised outcome is not re-weighted a second time.

For development there is an admin-only bridge at:

```text
POST /api/mintedup/orders/[id]/payment
```

It accepts `confirm` or `cancel`. In production the manual confirmation route is disabled unless `MINTEDUP_ALLOW_MANUAL_PAYMENT=1` is deliberately set. A real payment provider should call the domain payment-finalisation logic from a verified, idempotent webhook instead.

This manual bridge is **not** a payment processor and must not be presented to customers as one.

## Auctions

Minted Up uses proxy bidding. A bidder enters a maximum; the public bid advances only as far as necessary to remain ahead, subject to the increment rules and reserve.

Auction lots belong to curated sales. A lot cannot receive bids before its sale opens.

The current anti-sniping model extends the lot after each bid, starting at 10 seconds and shrinking by one second per extension to a one-second floor. The listing UI reflects the next extension amount. This behaviour should receive deterministic automated tests before production use.

When an auction closes:

- no qualifying bidder / reserve not met -> listing becomes `ended` and the no-sale outcome can be learned immediately;
- winning bidder -> listing becomes `reserved`, an unpaid order is created, and realised-sale learning waits for payment confirmation.

Auction settlement is still triggered lazily from reads such as browse/detail/dashboard. Move it to a scheduled or queue-backed worker before production.

## Research gateway

The research gateway is an explainable feedback system, not a free-form model memory.

Its core mechanisms are:

- BM25-style retrieval over tiered reference, market and community documents;
- curated reference material weighted above community material;
- naive-Bayes category suggestions with visible evidence terms;
- empirical-Bayes price guidance that shrinks thin comparable samples toward a category prior;
- append-only learning events so contributions can be audited and replayed.

The four signal classes are intentionally weighted differently:

1. searches: weak/noisy;
2. explicit confirmations or rejections: stronger;
3. attributes that survive into a curated listing: stronger again;
4. genuine market outcomes: strongest.

A **genuine market outcome now requires confirmed payment**. An unpaid reservation is never promoted to a realised-price market comparable.

## AI features

The listing composer supports:

- per-field AI SEO suggestions based on facts already entered;
- image-assisted beta auto-completion;
- explicit confidence/uncertainty handling;
- AI-assisted-field disclosure.

The prompts prohibit inventing maker, date, hallmark, provenance or material and require condition faults to remain visible. Applying an AI suggestion is a separate user action.

AI output remains advisory. Curation, seller responsibility and evidence quality are the trust boundary.

## Production gate

Minted Up is **not release-ready** yet. Before live commerce, complete at least:

1. **Real payments** — processor integration, authenticated/idempotent webhooks, payment failure/expiry handling, refunds, chargebacks and subscription dunning.
2. **Transactional database** — replace the JSON store before multi-instance or real-money operation.
3. **Automated domain tests** — especially proxy-bid ties, reserve edge cases, concurrent bids, settlement retries, payment retries/cancellation and research outcome idempotency.
4. **Rate limiting and abuse protection** — auth, applications, uploads, bidding, research and paid AI endpoints.
5. **Email/notifications** — invitations, outbid messages, payment actions, curation decisions and order confirmations.
6. **Object storage and delivery** — durable uploads, safe content serving and CDN strategy.
7. **Background jobs** — auction settlement, unpaid-order expiry, notification delivery and maintenance tasks.
8. **Demo-data isolation** — never seed production with demo credentials/accounts/orders.
9. **Fraud, authenticity and dispute policy** — particularly jewellery, watches, militaria and high-value categories.
10. **Legal/privacy/accessibility/security review** appropriate to a UK marketplace handling accounts, payments and user-generated listings.

A change is not considered proven because GitHub reports the branch as mergeable. The release gate is: locked dependency install, lint, typecheck, automated tests when present, production build, critical workflow validation and review of security/payment failure paths.

## Promoting Minted Up to its own site

The product is already separated cleanly enough to move to its own root/domain later. Keep `src/mintedup/` as the domain layer and move the app routes/chrome when the deployment boundary is ready rather than rewriting the marketplace logic.
