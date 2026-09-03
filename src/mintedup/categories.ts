/**
 * The Minted Up taxonomy.
 *
 * Minted Up sells antiques and collectibles and nothing else. This list is the
 * enforcement point: `isValidCategory` gates every listing, so there is no path
 * to publishing a phone case or a pair of trainers.
 */

export type Category = {
  id: string;
  name: string;
  group: string;
  blurb: string;
  /** Attribute prompts shown in the composer and the research gateway. */
  researchPrompts: string[];
};

export const CATEGORY_GROUPS = [
  "Furniture & Decorative",
  "Ceramics & Glass",
  "Silver & Metalware",
  "Jewellery & Watches",
  "Art & Prints",
  "Books & Ephemera",
  "Coins & Militaria",
  "Toys & Popular Collectibles",
] as const;

export const CATEGORIES: Category[] = [
  {
    id: "furniture-georgian",
    name: "Georgian & Regency Furniture",
    group: "Furniture & Decorative",
    blurb: "Mahogany, satinwood and rosewood case pieces, 1714-1837.",
    researchPrompts: ["Timber and veneer", "Handles and escutcheons", "Drawer construction", "Signs of later marriage"],
  },
  {
    id: "furniture-victorian",
    name: "Victorian & Edwardian Furniture",
    group: "Furniture & Decorative",
    blurb: "Walnut, oak and mahogany from 1837 to 1910.",
    researchPrompts: ["Maker's stamp or label", "Castor type", "Upholstery history", "Original finish or refinished"],
  },
  {
    id: "furniture-midcentury",
    name: "Mid-Century Design",
    group: "Furniture & Decorative",
    blurb: "Post-war designer furniture and lighting, 1945-1979.",
    researchPrompts: ["Designer and manufacturer", "Factory label or brand", "Model number", "Original textile"],
  },
  {
    id: "clocks-barometers",
    name: "Clocks & Barometers",
    group: "Furniture & Decorative",
    blurb: "Longcase, bracket, carriage and wall timepieces.",
    researchPrompts: ["Dial signature", "Movement type and count wheel", "Case timber", "Pendulum and weights present"],
  },
  {
    id: "ceramics-porcelain",
    name: "Porcelain",
    group: "Ceramics & Glass",
    blurb: "Soft and hard paste porcelain, European and Asian.",
    researchPrompts: ["Base mark", "Paste translucency", "Gilding wear", "Hairlines under raking light"],
  },
  {
    id: "ceramics-pottery",
    name: "Studio & Art Pottery",
    group: "Ceramics & Glass",
    blurb: "Studio ceramics, art pottery and slipware.",
    researchPrompts: ["Impressed seal or painted mark", "Glaze and body", "Throwing rings and foot", "Firing faults"],
  },
  {
    id: "glass-antique",
    name: "Antique & Art Glass",
    group: "Ceramics & Glass",
    blurb: "Cut, pressed, cameo and studio glass.",
    researchPrompts: ["Pontil mark", "Acid stamp or signature", "Colour and technique", "Rim and chip condition"],
  },
  {
    id: "silver-hallmarked",
    name: "Hallmarked Silver",
    group: "Silver & Metalware",
    blurb: "Sterling and continental silver with assay marks.",
    researchPrompts: ["Assay office and date letter", "Maker's mark", "Standard mark", "Weight in grams"],
  },
  {
    id: "metalware",
    name: "Bronze, Brass & Metalware",
    group: "Silver & Metalware",
    blurb: "Bronzes, brass, copper and treen.",
    researchPrompts: ["Foundry mark", "Patina and recolouring", "Casting method", "Signature to the base"],
  },
  {
    id: "jewellery-antique",
    name: "Antique & Period Jewellery",
    group: "Jewellery & Watches",
    blurb: "Georgian through Art Deco jewellery.",
    researchPrompts: ["Metal standard mark", "Cut of the stones", "Setting technique", "Original fittings and case"],
  },
  {
    id: "watches-vintage",
    name: "Vintage Watches",
    group: "Jewellery & Watches",
    blurb: "Pre-2000 mechanical wrist and pocket watches.",
    researchPrompts: ["Reference and serial number", "Calibre", "Dial originality and relume", "Service history"],
  },
  {
    id: "art-paintings",
    name: "Paintings & Drawings",
    group: "Art & Prints",
    blurb: "Original works on canvas, board and paper.",
    researchPrompts: ["Signature and inscription", "Support and stretcher", "Frame and labels", "Craquelure and relining"],
  },
  {
    id: "art-prints",
    name: "Prints & Posters",
    group: "Art & Prints",
    blurb: "Etchings, engravings, lithographs and vintage posters.",
    researchPrompts: ["Print process", "Edition and plate numbering", "Paper and watermark", "Foxing and light damage"],
  },
  {
    id: "books-manuscripts",
    name: "Rare Books & Manuscripts",
    group: "Books & Ephemera",
    blurb: "Antiquarian books, bindings and manuscript material.",
    researchPrompts: ["Edition and issue points", "Collation", "Binding and repairs", "Provenance bookplates"],
  },
  {
    id: "ephemera-maps",
    name: "Maps & Ephemera",
    group: "Books & Ephemera",
    blurb: "Antique maps, autographs, postcards and paper collectibles.",
    researchPrompts: ["Cartographer and state", "Colouring original or later", "Paper toning", "Trimmed margins"],
  },
  {
    id: "coins-medals",
    name: "Coins, Tokens & Medals",
    group: "Coins & Militaria",
    blurb: "Hammered and milled coinage, tokens and campaign medals.",
    researchPrompts: ["Denomination and date", "Mint mark", "Grade", "Third-party slab and number"],
  },
  {
    id: "militaria",
    name: "Militaria & Historic Arms",
    group: "Coins & Militaria",
    blurb: "Insignia, edged weapons and deactivated historic arms.",
    researchPrompts: ["Regimental marks", "Proof marks", "Period of issue", "Deactivation certificate"],
  },
  {
    id: "toys-vintage",
    name: "Vintage Toys & Models",
    group: "Toys & Popular Collectibles",
    blurb: "Tinplate, diecast, dolls and model railway.",
    researchPrompts: ["Maker and catalogue number", "Box present and grade", "Paint originality", "Working condition"],
  },
  {
    id: "collectibles-advertising",
    name: "Advertising & Breweriana",
    group: "Toys & Popular Collectibles",
    blurb: "Enamel signs, tins, point-of-sale and brewery collectibles.",
    researchPrompts: ["Printer's mark", "Enamel chips and rust", "Reproduction indicators", "Period of the campaign"],
  },
  {
    id: "collectibles-music",
    name: "Records & Music Memorabilia",
    group: "Toys & Popular Collectibles",
    blurb: "Original pressings, signed material and instruments.",
    researchPrompts: ["Matrix and runout etchings", "Label variant", "Sleeve grade", "Authentication for signatures"],
  },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category | undefined {
  return BY_ID.get(id);
}

export function isValidCategory(id: string): boolean {
  return BY_ID.has(id);
}

export function categoryName(id: string): string {
  return BY_ID.get(id)?.name ?? "Uncategorised";
}

export function categoriesByGroup(): { group: string; items: Category[] }[] {
  return CATEGORY_GROUPS.map((group) => ({
    group,
    items: CATEGORIES.filter((c) => c.group === group),
  }));
}
