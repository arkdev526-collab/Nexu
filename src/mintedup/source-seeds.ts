import { materialiseSourceRecord, sourceRecordToResearchDoc, type SourceRecordInput } from "./source-library";
import { mutate, read } from "./store";

const OBSERVED_AT = "2026-09-03T14:00:00.000Z";
const SYSTEM_ACTOR = "system:verified-source-pack";

type VerifiedSeed = { id: string; input: SourceRecordInput };

/**
 * Small, deliberately auditable starter pack from official source pages.
 * These are factual metadata records, not copied catalogue essays. The URLs,
 * record/lot identifiers and editorial snapshots are retained so a curator can
 * revisit the primary source and replace/update the record later.
 */
export const VERIFIED_SOURCE_SEEDS: VerifiedSeed[] = [
  {
    id: "src_met_79_2_781",
    input: {
      kind: "museum-object",
      sourceType: "museum",
      sourceName: "The Metropolitan Museum of Art",
      sourceUrl: "https://www.metmuseum.org/art/collection/search/48570",
      sourceRecord: "Object 79.2.781",
      categoryId: "ceramics-porcelain",
      title: "Qing dynasty vase, Qianlong mark and period",
      description: "The Met collection record identifies this Chinese vase as Qing dynasty, Qianlong mark and period (1736–95), dated to the late 18th century, in porcelain painted with overglaze polychrome enamels.",
      terms: [
        "form:vase",
        "material:porcelain",
        "period:qianlong period 1736 1795",
        "origin:china",
        "mark:qianlong mark",
        "motif:overglaze polychrome enamels",
        "dimension:height 38.1 cm",
      ],
      dimensions: "Height 38.1 cm; diameter 19.4 cm; rim 14.6 cm; foot 12.1 cm",
      snapshotTitle: "The Met object 79.2.781",
      snapshotExcerpt: "Official collection metadata records a Chinese Qing dynasty vase, Qianlong mark and period, late 18th century, porcelain with overglaze polychrome enamels; height 38.1 cm; object number 79.2.781.",
      observedAt: OBSERVED_AT,
    },
  },
  {
    id: "src_met_14_40_393",
    input: {
      kind: "museum-object",
      sourceType: "museum",
      sourceName: "The Metropolitan Museum of Art",
      sourceUrl: "https://www.metmuseum.org/art/collection/search/48771",
      sourceRecord: "Object 14.40.393",
      categoryId: "ceramics-porcelain",
      title: "Qing dynasty vase, Kangxi period",
      description: "The Met collection record identifies this vase as Chinese Qing dynasty, Kangxi period (1662–1722), made in porcelain.",
      terms: [
        "form:vase",
        "material:porcelain",
        "period:kangxi period 1662 1722",
        "origin:china",
        "dimension:height 70.2 cm",
      ],
      dimensions: "Height 70.2 cm; diameter 27.9 cm; rim 26 cm; foot 19.4 cm",
      snapshotTitle: "The Met object 14.40.393",
      snapshotExcerpt: "Official collection metadata records a Chinese Qing dynasty Kangxi-period porcelain vase; height 70.2 cm; object number 14.40.393.",
      observedAt: OBSERVED_AT,
    },
  },
  {
    id: "src_chr_2014_643",
    input: {
      kind: "auction-lot",
      sourceType: "auction-house",
      sourceName: "Christie's",
      sourceUrl: "https://press.christies.com/results-chinese-ceramics-works-of-art-and-textiles-1/",
      sourceRecord: "Sales 5749 & 5765 · Lot 643",
      categoryId: "ceramics-porcelain",
      title: "Crackle-glazed cong-form vase, Qianlong mark and period",
      description: "Christie's official results release lists lot 643 as a crackle-glazed cong-form vase with a Qianlong six-character seal mark in underglaze blue and of the period (1736–1795).",
      terms: [
        "form:cong-form vase",
        "mark:qianlong six-character seal mark",
        "period:qianlong period 1736 1795",
        "origin:china",
        "motif:crackle glaze",
      ],
      currency: "GBP",
      auction: {
        saleName: "Chinese Ceramics, Works of Art and Textiles",
        saleDate: null,
        lotNumber: "643",
        estimateLow: 2_000_000,
        estimateHigh: 3_000_000,
        buyerTotalPrice: 10_450_000,
        currency: "GBP",
        sold: true,
        priceNote: "Christie's results release states all sold prices include buyer's premium; price realised £104,500.",
      },
      snapshotTitle: "Christie's Chinese Ceramics, Works of Art and Textiles results",
      snapshotExcerpt: "Official results release lists lot 643, crackle-glazed cong-form Qianlong vase, estimate £20,000–30,000 and price realised £104,500; the release states sold prices include buyer's premium.",
      observedAt: OBSERVED_AT,
    },
  },
  {
    id: "src_chr_1119_147",
    input: {
      kind: "auction-lot",
      sourceType: "auction-house",
      sourceName: "Christie's",
      sourceUrl: "https://press.christies.com/results-fine-chinese-ceramics-and-works-of-art-1/?lang=eng",
      sourceRecord: "Sale 1119 · Lot 147",
      categoryId: "metalware",
      title: "Cloisonné enamel baluster vase and cover, Qianlong mark and period",
      description: "Christie's official results release lists lot 147 as a cloisonné enamel baluster vase and cover with a Qianlong four-character mark within a double-square and of the period (1736–1795).",
      terms: [
        "form:baluster vase and cover",
        "material:cloisonne enamel",
        "mark:qianlong four-character mark within double-square",
        "period:qianlong period 1736 1795",
        "origin:china",
      ],
      currency: "GBP",
      auction: {
        saleName: "Fine Chinese Ceramics and Works of Art",
        saleDate: "2013-05-14T00:00:00.000Z",
        lotNumber: "147",
        estimateLow: 6_000_000,
        estimateHigh: 8_000_000,
        buyerTotalPrice: 81_787_500,
        currency: "GBP",
        sold: true,
        priceNote: "Christie's results release states all sold prices include buyer's premium; price realised £817,875.",
      },
      snapshotTitle: "Christie's Fine Chinese Ceramics and Works of Art results",
      snapshotExcerpt: "Official results for sale 1119 list lot 147, Qianlong cloisonné enamel baluster vase and cover, estimate £60,000–80,000 and price realised £817,875; sold prices include buyer's premium.",
      observedAt: OBSERVED_AT,
    },
  },
];

let ensuring: Promise<void> | null = null;

/** Add/update only the deterministic official starter pack, even on an existing demo DB. */
export async function ensureVerifiedSourceSeeds(): Promise<void> {
  const missing = await read((db) => VERIFIED_SOURCE_SEEDS.some((seed) => !db.sourceRecords.some((record) => record.id === seed.id)));
  const missingDocs = await read((db) => VERIFIED_SOURCE_SEEDS.some((seed) => {
    const record = db.sourceRecords.find((candidate) => candidate.id === seed.id);
    return Boolean(record && !db.researchDocs.some((doc) => doc.sourceRecordId === record.id));
  }));
  if (!missing && !missingDocs) return;

  ensuring ??= mutate((db) => {
    for (const seed of VERIFIED_SOURCE_SEEDS) {
      let record = db.sourceRecords.find((candidate) => candidate.id === seed.id);
      if (!record) {
        record = materialiseSourceRecord(seed.input, SYSTEM_ACTOR, {
          id: seed.id,
          reviewStatus: "verified",
          now: OBSERVED_AT,
        });
        db.sourceRecords.push(record);
      }
      if (record.reviewStatus !== "verified") continue;
      let doc = db.researchDocs.find((candidate) => candidate.sourceRecordId === record.id);
      const synced = sourceRecordToResearchDoc(record, doc?.id);
      if (doc) Object.assign(doc, synced);
      else {
        db.researchDocs.push(synced);
        doc = synced;
      }
      record.researchDocId = doc.id;
    }
  }).finally(() => {
    ensuring = null;
  });
  return ensuring;
}
