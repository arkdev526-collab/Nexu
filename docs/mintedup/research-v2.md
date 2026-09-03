# Minted Up Research v2

Research v2 changes the gateway from a mostly lexical retrieval prototype into an evidence-led antiques research system. It is still a transparent statistical engine rather than an authentication service.

## Core rule: physical comparability beats superficial similarity

The comparable scorer gives explicit weight to value-critical attributes:

| Attribute | Relative weight |
| --- | ---: |
| Mark | 5.0 |
| Maker | 4.5 |
| Form / function | 4.0 |
| Material | 3.5 |
| Period | 2.5 |
| Origin | 2.5 |
| Condition | 2.5 |
| Dimensions / scale | 2.5 |
| Decoration / motif | 2.0 |
| Generic keyword | 0.75 |

A lexical match can therefore be rejected from pricing when it conflicts with a confirmed maker, mark or form. Every admitted comparable exposes its match score, matching attributes, conflicts and source label.

## Source provenance and trust

`ResearchDoc` now has backwards-compatible provenance fields: source type, source name, URL, source record identifier, verification flag, observation date, price basis and asking price. Old JSON rows continue to load because every new field is optional.

The source hierarchy distinguishes museums/institutions, auction houses, marketplace sale records, dealers, sellers and Minted Up seed/reference records. Source trust affects ranking but does not convert a weak source into a fact.

Current bundled reference and market documents are demo seed material unless a real source record is attached. The UI deliberately labels that distinction.

## Realised prices are not asking prices

Research v2 price guidance:

1. filters by currency before doing any price statistics;
2. excludes records marked `priceBasis: asking` even if a numeric price is present;
3. uses physically admissible realised sales as the matched sample;
4. shrinks thin samples toward the same-category realised-price prior;
5. reports the number of asking-price records excluded;
6. exposes match and source-quality information for every displayed comparable.

There is no automatic FX conversion yet. A GBP valuation uses GBP evidence only. Currency normalisation should be added later with dated FX rates rather than silently mixing nominal prices.

## Anti-poisoning changes

Research v1 could write its own top predicted category back as the category attached to a query event. That created a self-confirming feedback path. Research v2 records category identity from a query only when the user explicitly selected that category.

Further controls:

- community contributor term/category influence is capped;
- event influence is capped per actor, category and term;
- raw document feedback is bounded in v2 ranking;
- anonymous feedback can no longer reweight corpus documents;
- feedback terms/category are taken from the server-side source record rather than client input;
- research sessions are owner-checked before signals or feedback can attach to them.

## Confidence language

The percentage shown in the Research v2 UI is a research-confidence indicator assembled from category separation, confirmed observations and source quality. It is explicitly **not** an authenticity probability and must never be marketed as one.

Low or moderate confidence is expected when marks, dimensions, material evidence or authoritative references are missing. The UI explains what evidence would most improve discrimination next.

## Tests

The Research v2 regression suite proves that:

- an exact physical match outranks a lexically similar object of the wrong form;
- asking prices cannot enter realised-value comparables;
- currencies are not mixed;
- a trusted reference outranks a heavily up-weighted community claim.

The existing proof suite continues to cover auction, payment and reservation invariants. Both suites run before lint, TypeScript and the production build in Minted Up CI.
