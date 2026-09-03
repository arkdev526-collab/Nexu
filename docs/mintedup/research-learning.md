# How the research gateway learns

> "Have the research section learn with every input from user as they research their
> object before listing, expand upon this to get the best result/outcome, how do I do
> this?"

This is the design that question deserves, the part of it that is built, and the path to
the rest. The code is `src/mintedup/research.ts`.

## The core idea

A research gateway that learns is not a search box with a database behind it. It is a
**feedback system**, and the whole design question is *which signals do you trust, and how
much*. Get the weighting wrong and the system confidently learns whatever is most common,
which in antiques is usually the most common misidentification.

Minted Up's answer: four loops, weighted by how much each one cost the person who produced
it, with the market — the only signal nobody can fake — weighted highest.

| # | Loop | Signal | Weight | Why that weight |
| --- | --- | --- | --- | --- |
| 1 | Implicit | A search query | 0.1 | Cheap, plentiful, noisy. Evidence that two ideas go together in one person's head. |
| 2 | Explicit | "Yes, that's the mark" / "No" | ±1.0 | Someone looked at a candidate and judged it. Sparse and much stronger. |
| 3 | Committed | Attributes that reach a published listing | 2.0 | A considered public assertion made at some cost. |
| 4 | Outcome | What it actually sold for, or failed to sell for | 5.0 / −1.5 | Ground truth. This is what grades the three above. |

Everything lands in one append-only table (`learningEvents`). Nothing mutates learned
state in place. That single decision buys you: reproducibility, the ability to replay the
model after a bug, per-user attribution when something gets poisoned, and an audit trail
when a seller asks why the gateway told them £400.

## What is built

### Retrieval — BM25 over a tiered corpus

The corpus (`researchDocs`) holds three kinds of document:

- **reference** — curated, editorially maintained (hallmark reading, the 1891 country-of
  -origin rule, print processes under a loupe, and so on)
- **market** — a real sale with a realised price
- **community** — what sellers have established while researching

BM25 ranks them, then the score is multiplied by a tier weight (reference 1.6, market 1.2,
community 0.8) and by the accumulated feedback the document has earned. **Curated material
outranking the crowd is the anti-poisoning rule**: a popular wrong answer cannot bury a
documented fact.

### Identification — naive Bayes over term/category co-occurrence

`P(category | terms)`, in log space with Laplace smoothing, softmaxed back to readable
probabilities. The contingency table is built from the corpus *and* replayed from every
learning event at that event's weight — so confirmations and sales genuinely move it.

It returns the evidence as well as the probability ("ceramics-porcelain, 89%, because of:
crossed swords, hard paste"). An identification you cannot explain is not much use to
someone about to write a description they are legally answerable for.

### Price — empirical Bayes with honest confidence

Naive comparable-price averaging is dangerous with three data points. Instead:

1. Take the log of every realised price in the category — that is the prior, `(m₀, σ₀)`.
2. Find comparables that share at least two terms with the object; weight each by BM25
   relevance to get a sample mean `m`.
3. Shrink toward the prior: `k = n / (n + 5)`, posterior `= k·m + (1−k)·m₀`.
4. The band keeps the prior's spread when `n` is small and narrows as evidence arrives.

With two comparables you get a wide range and a confidence of 0.29, reported as such. With
twenty you get a tight range and 0.8. **The system says how much it knows**, which matters
more than the midpoint.

### Better questions — the part that makes each input count

After every search the gateway computes which attribute the surviving candidates *disagree
about most* and asks the seller that. It is a cheap approximation of expected information
gain, and it is the mechanism by which each input improves the next answer: answering the
most-contested attribute eliminates the largest number of possibilities.

This is why the research page shows "Tell it this next" rather than only showing results.
A gateway that only answers is a search engine; a gateway that asks is an appraiser.

### Write-back

- Publishing a listing adds it to the corpus immediately (loop 3) — the next seller
  researching that mark benefits before the piece has even sold.
- A sale promotes that document to the `market` tier with its realised price (loop 4), so
  it becomes a comparable.
- A failed auction is recorded too, at negative weight. Knowing what did *not* sell at a
  price is as informative as knowing what did.
- Rating a result "useful" or "not mine" reweights the document it came from, so the
  corpus reorders itself under use.

## How to expand it

Roughly in the order the returns justify the work.

### 1. Hybrid retrieval, once the corpus passes ~10,000 documents

BM25 cannot match "cobalt underglaze" to "blue painted beneath the glaze". Add embeddings
and combine with reciprocal rank fusion:

```
score = 1/(60 + rank_bm25) + 1/(60 + rank_vector)
```

Keep BM25. It is unbeatable on exact mark transcriptions and catalogue numbers, which is a
large share of real antiques queries. Hybrid beats either alone; replacing BM25 with
vectors makes mark lookup worse.

### 2. Vision as a first-class research signal

The composer already reads photographs for auto-complete. Do the same in the gateway:
embed uploaded images, index the corpus by image as well as text, and let a seller find
their object by shape and decoration when they have no vocabulary for it. This is the
single biggest usability win available — most people researching an inherited object do
not know the word "vesta case".

### 3. A held-out evaluation set, before you tune anything else

Take sold listings, hold out 20%, and measure:

- **top-1 and top-3 category accuracy**
- **price MAPE**, and separately the *calibration* of the confidence figure — when the
  gateway says 0.8, is it right 80% of the time?
- **attribute precision** against confirmed signals

Then gate every index or weighting change on it. Without this you are tuning by vibes, and
a feedback system tuned by vibes drifts. This is the highest-value unglamorous work on the
list.

### 4. Confidence decay and recency weighting

The antiques market moves. Brown furniture is worth a fraction of its 2005 price; mid
-century has gone the other way. Decay the weight of a realised price by age —
`weight × exp(−age_days / 730)` is a reasonable start — and re-fit periodically. A 2011
comparable should not carry the same authority as a 2026 one.

### 5. Anti-poisoning, properly

The tier system is the first line. Add:

- **Per-contributor caps** so one seller cannot shift a prior by listing the same object
  forty times.
- **Agreement thresholds**: a community fact needs corroboration from *n* independent
  sellers before it influences suggestions.
- **A review queue in admin** for community documents that cross an impact threshold — the
  admin page already flags documents sellers keep rejecting.
- **Contribution provenance** on display, so a seller can see whether a suggestion rests on
  a reference work or on one stranger's guess.

### 6. Separate "what it is" from "what it's worth"

They fail differently and should be evaluated and displayed separately. Identification is a
classification problem with a right answer. Valuation is a distribution, conditioned on
condition, completeness, provenance and the current market. Do not let a confident
identification lend unearned confidence to a price.

### 7. Human expertise in the loop

At some scale, pay specialists to adjudicate contested identifications and mark them
`reference`. This is what makes the difference between a system that converges on truth and
one that converges on consensus. Budget for it — it is the moat, not the ML.

## Two things to be careful about

**Do not let the gateway launder a guess into an assertion.** Everything it produces is a
suggestion with evidence and a confidence figure attached, and the seller confirms it
before it reaches a listing. An attribution that outruns its evidence is how a sale gets
unwound, and the platform that generated the copy will be part of that argument. The AI
prompts in `ai.ts` carry the same rule.

**Learn from every input, but weight by what the input cost.** A search is worth almost
nothing; a realised price is worth everything. That ratio — 50:1 in `EVENT_WEIGHTS` — is
the single most consequential number in the design, and it is the one to revisit first when
the gateway starts saying something silly.
