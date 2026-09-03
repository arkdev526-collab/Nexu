# Minted Up Source Library & Auction Intelligence

The Source Library is the auditable evidence layer beneath Research v2. `ResearchDoc` remains a search/index representation; `SourceRecord` is the source-of-truth record for externally sourced museum, institutional, auction, dealer and marketplace evidence.

## Workflow

1. Evidence is imported as a **draft** source record.
2. Minted Up canonicalises the URL/record identity and calculates a deterministic source fingerprint.
3. Exact imports are idempotent and probable duplicates are surfaced to the curator.
4. A curator opens the primary source and checks the metadata, typed physical attributes, price basis and snapshot note.
5. **Verify** publishes or updates a derived `ResearchDoc`; **reject** removes its derived document.
6. Research v2 ranks the verified evidence using source trust, physical comparable fit and lexical relevance separately.

The review desk is `/mintedup/admin/sources`. Curator/admin accounts also have a **Sources** navigation link. A curator-authenticated JSON boundary at `/api/mintedup/sources` is available for future approved import adapters.

## Evidence snapshots

Minted Up does not fetch arbitrary URLs from the web application. That would create an unnecessary SSRF/crawler boundary and would make copyright/licensing behaviour hard to audit.

Instead, a source record stores:

- canonical source URL;
- source name and object/sale/lot identifier;
- short curator/importer-written evidence description;
- short bounded snapshot/excerpt metadata;
- capture/observation time;
- SHA-256 hash of the snapshot metadata payload.

The hash is not proof that the external page can never change. It is a tamper-evident identifier for what Minted Up recorded at that observation point. Production source adapters should archive only material they are permitted to retain and should preserve provider terms/licensing metadata.

## Auction price semantics

Auction values are deliberately explicit. A source can record:

- estimate low/high;
- hammer price;
- buyer-premium percentage (stored as basis points);
- buyer-premium amount;
- buyer-total / premium-inclusive price;
- sold/no-sale state;
- the source's exact price-basis note.

When enough information exists, Minted Up can reconcile or derive premium and buyer-total figures. Inconsistent hammer/premium/total combinations are rejected.

**Valuation rule:** an auction lot enters Minted Up's `realisedPrice` / “what the buyer paid” guidance only when a premium-inclusive buyer total is known. A hammer-only result remains searchable market evidence but its `realisedPrice` is null, so Research v2 cannot silently mix hammer prices with buyer totals.

Currencies remain isolated in Research v2. No FX conversion is performed implicitly.

## Duplicate detection

The strongest duplicate keys are:

1. same canonical source + source record/object/lot identifier;
2. same auction house + sale date + lot number;
3. same canonical URL;
4. fallback similarity of category/title/dimensions.

An exact canonical re-import returns the existing source record rather than creating another row. A draft that exactly duplicates an already verified record cannot be verified again.

## Initial verified primary-source pack

The first pack is intentionally small and inspectable rather than a bulk scrape:

- The Metropolitan Museum of Art — object `79.2.781`, Qing dynasty vase, Qianlong mark and period: `https://www.metmuseum.org/art/collection/search/48570`
- The Metropolitan Museum of Art — object `14.40.393`, Qing dynasty vase, Kangxi period: `https://www.metmuseum.org/art/collection/search/48771`
- Christie's — Chinese Ceramics, Works of Art and Textiles, lot `643`, Qianlong crackle-glazed cong-form vase: `https://press.christies.com/results-chinese-ceramics-works-of-art-and-textiles-1/`
- Christie's — sale `1119`, lot `147`, Qianlong cloisonné enamel baluster vase and cover: `https://press.christies.com/results-fine-chinese-ceramics-and-works-of-art-1/?lang=eng`

The two Christie's records use the reported premium-inclusive sold prices because the official results releases state that sold prices include buyer's premium. The Met records are reference evidence and carry no invented market value.

## Production boundary

This implementation is a prototype evidence pipeline, not a bulk crawler. Before production-scale ingestion, add provider-specific/licensed adapters and background jobs with:

- source-specific API/licence rules;
- retry/idempotency keys;
- crawl/request budgets where permitted;
- source versioning and tombstones;
- image/licensing policy;
- database-level uniqueness constraints on source fingerprints;
- structured review/audit history;
- normalised sale-date/venue/currency fields;
- explicit hammer-vs-buyer-total conversions;
- duplicate clustering across auction syndication/republication;
- scheduled freshness checks.

The file-backed JSON store remains a development implementation. A transactional/shared database is still a production gate.
