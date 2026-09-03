# Minted Up source adapters and scheduled ingestion

## Principle

A source adapter is a named integration with a known provider. It is not a general web crawler. Adapters map remote fields into `SourceRecordInput`, and imported records remain `draft` until a Minted Up curator verifies them.

The first adapter is **The Metropolitan Museum of Art Open Access Collection API**.

## The Met Open Access adapter

The Met makes its Open Access collection data available under CC0. Minted Up still keeps the institution and official object URL attached to every record so evidence remains traceable and the source is not misrepresented.

The adapter deliberately:

- accepts only API objects with `isPublicDomain === true`;
- copies no museum image into Minted Up;
- stores factual object metadata and a bounded metadata snapshot;
- uses the accession number as the canonical source identifier where available;
- maps only curator-authored search profiles to Minted Up categories;
- imports to the Source Library review queue, never directly to verified Research v2 evidence;
- does not use `hasImages=true` as a correctness requirement;
- fetches object detail serially in small batches;
- retries 403, 429 and 5xx responses with bounded exponential / `Retry-After` backoff;
- stops accumulating remote errors after a bounded number rather than hammering the provider.

Current profiles rotate across Qing porcelain, Chinese cloisonné/enamel metalwork, Georgian furniture and historic glass vessels. Profiles are intentionally narrow and are code-reviewed before they can become scheduled queries.

## Manual ingestion

Curators can open:

`/mintedup/admin/sources/ingestion`

A dry run fetches and maps records but does not modify the Source Library. **Import drafts** creates idempotent draft `SourceRecord` rows. Existing canonical records count as duplicates and are not copied.

The authenticated API boundary is:

`POST /api/mintedup/sources/met`

with `profileId`, optional `limit`, and optional `dryRun: true`.

## Scheduled ingestion

`vercel.json` schedules:

`GET /api/mintedup/cron/source-ingestion`

at **03:17 UTC daily**. The scheduled profile rotates by UTC date to keep request volume small.

The route requires a Bearer secret from `MINTEDUP_CRON_SECRET` or Vercel's conventional `CRON_SECRET`.

More importantly, the route returns a successful **skipped** response unless all three operational flags are true:

- `MINTEDUP_ENABLE_SCHEDULED_INGESTION=1`
- `MINTEDUP_CRON_PRIMARY=1`
- `MINTEDUP_DURABLE_STORE=1`

This is deliberate. Minted Up still uses a prototype file-backed database, and a serverless cron writing to that filesystem would create the appearance of persistence without actually providing it. `MINTEDUP_DURABLE_STORE=1` must only be set after the database has genuinely moved to shared persistent storage.

There are currently two Vercel projects attached to this Git branch. Only the canonical production project should ever receive `MINTEDUP_CRON_PRIMARY=1`; the duplicate project must remain non-primary or be disconnected.

## Review remains the trust boundary

Scheduled ingestion does not authenticate an object and does not publish evidence. It only creates draft source records. A curator still checks:

1. that the official source URL and identifier match;
2. that Minted Up's category mapping is appropriate;
3. that dimensions, medium, period, maker and other typed terms are faithful to the source;
4. that the record is not a duplicate or a materially different variant;
5. that no unsupported valuation claim has been introduced.

Only `reviewSourceRecord(..., "verify", ...)` materialises the source into Research v2.

## Next provider adapters

Auction houses should be added one by one only where terms, API/feed access or licensing permit it. Their adapters must preserve sale date, lot number, estimate, hammer/buyer-total semantics and the provider's own price-basis statement. No adapter should infer buyer's premium where the source does not disclose enough information to reconcile it.
