import { hashPassword } from "./auth";
import { currentMonth, FREE_LISTING_ALLOWANCE } from "./membership";
import { mutate, newId, read } from "./store";
import type { CuratedAuction, Database, Listing, ResearchDoc, User } from "./types";

/**
 * First-run seed.
 *
 * The reference tier is the important part: without a curated corpus the
 * research gateway has nothing to reason from on day one, and a marketplace
 * that learns only from its own users starts by learning nothing. These entries
 * stand in for what would be a licensed or editorially-maintained reference
 * layer in production — see docs/mintedup/research-learning.md.
 *
 * The market tier carries realised prices so price guidance has a prior.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
const daysAhead = (n: number) => new Date(Date.now() + n * 864e5).toISOString();

type SeedDoc = Omit<ResearchDoc, "id" | "createdAt" | "weight" | "contributedBy" | "sourceListingId" | "currency"> &
  Partial<Pick<ResearchDoc, "currency">>;

const REFERENCE: SeedDoc[] = [
  {
    tier: "reference",
    title: "British silver hallmarks: reading the four marks",
    categoryId: "silver-hallmarked",
    realisedPrice: null,
    terms: ["mark:lion passant", "mark:leopard's head", "mark:anchor", "material:sterling silver", "keyword:hallmark", "keyword:assay"],
    body: "A full British hallmark carries a standard mark, a town mark, a date letter and a maker's mark. The lion passant is the sterling standard for England; Britannia standard shows the seated figure instead. The leopard's head is London, the anchor Birmingham, the crown (to 1975) Sheffield, and the castle Edinburgh. Date letters run in alphabetic cycles with the typeface and shield shape changing between cycles, so the letter alone never dates a piece — read letter, shield and town together. An import mark and the numerals 925 appear on foreign silver assayed in Britain after 1904. Electroplate carries EPNS or A1 and no assay marks at all; that is the single most common misidentification in this category.",
  },
  {
    tier: "reference",
    title: "Dating porcelain by its base mark and paste",
    categoryId: "ceramics-porcelain",
    realisedPrice: null,
    terms: ["mark:crossed swords", "mark:anchor", "material:hard paste", "material:soft paste", "keyword:underglaze blue", "period:18th century"],
    body: "Underglaze blue marks sit beneath the glaze and cannot be felt with a fingernail; a mark that sits proud, or that is crisp where the decoration is soft, is a later addition. Hard paste rings and shows a glassy, cold break; soft paste is warmer, more granular and often shows a slightly uneven glaze pooling at the foot. Crossed swords indicate Meissen but have been copied continuously since the eighteenth century, so read the swords against the paste, the modelling and the palette rather than on their own. Impressed numerals are usually mould or repairer's numbers, not dates.",
  },
  {
    tier: "reference",
    title: "Country of origin marks and the 1891 rule",
    categoryId: "ceramics-pottery",
    realisedPrice: null,
    terms: ["mark:made in england", "mark:england", "keyword:mckinley tariff", "period:1891", "period:1921"],
    body: "The US McKinley Tariff Act of 1891 required imported goods to be marked with their country of origin, so an unmarked piece is usually earlier than 1891 and a piece marked simply ENGLAND generally falls between 1891 and about 1921. From roughly 1921 the fuller MADE IN ENGLAND becomes standard. This dates the mark, not necessarily the object, and pieces made for the home market were never obliged to carry it — treat the rule as an upper or lower bound, never as a date.",
  },
  {
    tier: "reference",
    title: "Registered design numbers as a dating tool",
    categoryId: "collectibles-advertising",
    realisedPrice: null,
    terms: ["mark:rd no", "keyword:registered design", "period:victorian", "period:edwardian"],
    body: "A British registered design number (Rd No) gives the year the design was registered, which is the earliest possible date of manufacture but says nothing about how long it stayed in production. Numbers begin at 1 in 1884 and run to around 360,000 by 1900 and 660,000 by 1914. The earlier diamond registration mark, used 1842 to 1883, encodes class, day, month and year in its corners. Both mark the design's registration only, so a piece can be decades later than its Rd No.",
  },
  {
    tier: "reference",
    title: "Recognising restoration in ceramics and glass",
    categoryId: "ceramics-porcelain",
    realisedPrice: null,
    terms: ["condition:restored", "condition:hairline", "keyword:overpaint", "keyword:uv light"],
    body: "Under a UV lamp modern restoration fluoresces a dull purple or yellow against the even glow of original glaze. Run a fingertip along a rim: a filled chip is smoother and warmer than the fired glaze around it. Tap a plate suspended on the fingertips — a clear ring means it is sound, a dead thud means a hairline crack somewhere. Overpainted decoration sits above the glaze and abrades under gentle pressure from a cotton bud. Declare all of it; a restored piece honestly described sells, an undeclared one comes back.",
  },
  {
    tier: "reference",
    title: "Furniture construction: what the joints and saw marks tell you",
    categoryId: "furniture-georgian",
    realisedPrice: null,
    terms: ["keyword:dovetail", "keyword:saw marks", "material:mahogany", "material:oak", "period:georgian"],
    body: "Hand-cut dovetails are few, wide and slightly irregular; machine dovetails from about 1860 are numerous, even and identical. Circular saw marks appear from around 1830 and rule out an earlier date for that component. Genuine shrinkage makes a round table top slightly oval across the grain. Look inside for secondary timbers: an English carcase in oak or deal, an American in poplar or pine. A piece with hand-cut dovetails at the front and machine-cut at the back has been married from two carcases, which halves its value and must be disclosed.",
  },
  {
    tier: "reference",
    title: "Print processes under magnification",
    categoryId: "art-prints",
    realisedPrice: null,
    terms: ["keyword:etching", "keyword:lithograph", "keyword:halftone", "keyword:plate mark", "material:laid paper"],
    body: "A loupe settles most print questions. An etching or engraving shows ink standing proud in incised lines and usually a plate mark embossed into the paper. A lithograph has a soft grainy tooth with no plate mark. A modern reproduction resolves into a regular dot rosette under magnification — that rosette is conclusive. Laid paper shows chain lines against the light, and a watermark can date the sheet independently of the image. Foxing, trimmed margins and light-struck margins each carry a real discount and belong in the description.",
  },
  {
    tier: "reference",
    title: "Vintage watches: reference, calibre and dial originality",
    categoryId: "watches-vintage",
    realisedPrice: null,
    terms: ["keyword:reference number", "keyword:calibre", "condition:relumed", "condition:redial", "keyword:service history"],
    body: "The reference number lives between the lugs and identifies the case and model; the movement's serial and calibre are on the movement itself. Value turns overwhelmingly on dial originality: a redial usually shows uneven text spacing, printing that runs over the minute track, or a finish too clean for the case. Relumed hands and markers glow far brighter and more evenly than aged tritium, which turns cream to caramel. Service parts, a replaced bezel or a polished-away case chamfer each reduce value materially and must be stated.",
  },
  {
    tier: "reference",
    title: "Studio pottery: seals, footrings and glaze faults",
    categoryId: "ceramics-pottery",
    realisedPrice: null,
    terms: ["mark:impressed seal", "keyword:footring", "keyword:throwing rings", "material:stoneware", "condition:firing crack"],
    body: "Studio pieces are usually marked with an impressed personal seal, sometimes alongside a pottery's seal — two seals mean the potter and the workshop, which is normal and not a warning sign. The foot is where attribution lives: how it is turned, how far the glaze is wiped back, whether the clay is grogged. A firing crack happened in the kiln and is original to the piece; a later crack cuts through the glaze and often stains. Both belong in the description, but they are not the same fault and should not be described as one.",
  },
  {
    tier: "reference",
    title: "Photographing antiques so the detail survives",
    categoryId: "furniture-victorian",
    realisedPrice: null,
    terms: ["keyword:photography", "keyword:raking light", "keyword:colour accuracy"],
    body: "Shoot in diffuse daylight against a plain mid-grey ground, with the piece filling the frame. Photograph the base, the reverse and every mark close enough to read. Use raking light — a lamp almost parallel to the surface — to reveal scratches, filled chips and craquelure that flat light hides. Include a scale in one frame. Never sharpen, never brighten to hide a stain, and upload the original file: a photograph sent through a messaging app before upload has already lost most of the detail a buyer wants to zoom into.",
  },
  {
    tier: "reference",
    title: "Provenance: what actually counts as evidence",
    categoryId: "art-paintings",
    realisedPrice: null,
    terms: ["keyword:provenance", "keyword:exhibition label", "keyword:auction stencil"],
    body: "Provenance is a documented chain, not a story. Exhibition labels, gallery stencils, auction lot numbers on the stretcher, inventory numbers and dated invoices are all evidence and should be photographed. Family recollection is context, not provenance, and should be described as such. Never write a name into a listing that the paperwork does not carry; an attribution that outruns its evidence is the fastest way to have a sale unwound.",
  },
  {
    tier: "reference",
    title: "Coins: grading language and what slabbing changes",
    categoryId: "coins-medals",
    realisedPrice: null,
    terms: ["keyword:grade", "keyword:mint mark", "keyword:slabbed", "condition:extremely fine"],
    body: "British grading runs Poor, Fair, Good, Fine, Very Fine, Extremely Fine, Uncirculated and finally FDC for proof material. The gap between VF and EF is where most of the money sits, so grade conservatively and photograph both faces under even light. Cleaning is not a neutral act: a brightened surface with hairline scratches is worth materially less than the same coin with an untouched patina. A third-party slab transfers the grading argument to the grader and typically narrows the price spread, so quote the certification number when there is one.",
  },
];

const MARKET: (SeedDoc & { realisedPrice: number })[] = [
  {
    tier: "market", title: "George III mahogany bureau bookcase, astragal glazed", categoryId: "furniture-georgian",
    realisedPrice: 148000, currency: "GBP",
    terms: ["material:mahogany", "period:george iii", "origin:england", "keyword:bureau", "keyword:astragal", "condition:good"],
    body: "Astragal glazed upper section over a fall front bureau, fitted interior, bracket feet. Hand-cut dovetails throughout, oak linings, original brasses with shadow. Some restoration to the feet, colour good.",
  },
  {
    tier: "market", title: "Victorian walnut credenza with marquetry inlay", categoryId: "furniture-victorian",
    realisedPrice: 62000, currency: "GBP",
    terms: ["material:walnut", "period:victorian", "keyword:credenza", "keyword:marquetry", "condition:very-good"],
    body: "Burr walnut credenza, gilt metal mounts, marquetry panelled doors, serpentine ends. Original glass, later castors, polished at some point in the last century.",
  },
  {
    tier: "market", title: "Meissen porcelain figure group, crossed swords mark", categoryId: "ceramics-porcelain",
    realisedPrice: 94000, currency: "GBP",
    terms: ["mark:crossed swords", "material:hard paste", "period:19th century", "origin:germany", "condition:restored"],
    body: "Figure group of two musicians, crossed swords in underglaze blue to the base with incised model number. Restoration to one hand and to the tip of a flute, otherwise good with strong gilding.",
  },
  {
    tier: "market", title: "Studio stoneware vase, impressed seal, tenmoku glaze", categoryId: "ceramics-pottery",
    realisedPrice: 22000, currency: "GBP",
    terms: ["mark:impressed seal", "material:stoneware", "keyword:tenmoku", "keyword:footring", "condition:excellent"],
    body: "Bottle form in stoneware under a tenmoku glaze breaking rust at the rim. Impressed personal seal to the foot beside a pottery seal. Crisp throwing rings, turned footring, no faults.",
  },
  {
    tier: "market", title: "Georgian silver salver, London 1789, maker's mark WP", categoryId: "silver-hallmarked",
    realisedPrice: 78000, currency: "GBP",
    terms: ["mark:lion passant", "mark:leopard's head", "material:sterling silver", "period:georgian", "origin:london", "condition:very-good"],
    body: "Circular salver with gadrooned border on three hoof feet. Full hallmarks for London 1789, maker's mark WP. Later engraved armorial to the centre, 892 grams.",
  },
  {
    tier: "market", title: "Art Deco platinum and diamond panel bracelet", categoryId: "jewellery-antique",
    realisedPrice: 340000, currency: "GBP",
    terms: ["material:platinum", "material:diamond", "period:art deco", "keyword:millegrain", "condition:excellent"],
    body: "Geometric panel bracelet, old European and baguette cut diamonds in millegrain settings, concealed box clasp with figure-of-eight safeties. Unmarked, tests as platinum.",
  },
  {
    tier: "market", title: "Vintage stainless chronograph, original dial", categoryId: "watches-vintage",
    realisedPrice: 520000, currency: "GBP",
    terms: ["keyword:chronograph", "keyword:reference number", "condition:excellent", "keyword:service history", "period:1960s"],
    body: "Manual wind chronograph, original dial with even tritium patina, unpolished case with sharp lug chamfers, service papers from two intervals. Bracelet later.",
  },
  {
    tier: "market", title: "Etching, signed in pencil, plate mark visible", categoryId: "art-prints",
    realisedPrice: 14000, currency: "GBP",
    terms: ["keyword:etching", "keyword:plate mark", "material:laid paper", "condition:good", "keyword:pencil signed"],
    body: "Etching on laid paper with visible plate mark and chain lines, signed and numbered in pencil in the lower margin. Light foxing to the margins, image clean.",
  },
  {
    tier: "market", title: "Enamel advertising sign, single sided, Rd No to lower edge", categoryId: "collectibles-advertising",
    realisedPrice: 46000, currency: "GBP",
    terms: ["mark:rd no", "keyword:enamel sign", "period:edwardian", "condition:fair", "keyword:advertising"],
    body: "Single sided enamel sign with registered design number to the lower edge. Chipping to the fixing holes and one edge, colours strong, no restoration.",
  },
  {
    tier: "market", title: "Boxed diecast model, original box with insert", categoryId: "toys-vintage",
    realisedPrice: 9500, currency: "GBP",
    terms: ["keyword:diecast", "keyword:boxed", "condition:excellent", "period:1960s", "keyword:catalogue number"],
    body: "Diecast model in original card box with inner insert and leaflet. Paint unmarked, tyres original, box with light shelf wear to one corner.",
  },
  {
    tier: "market", title: "Longcase clock, eight day movement, signed dial", categoryId: "clocks-barometers",
    realisedPrice: 118000, currency: "GBP",
    terms: ["keyword:longcase", "keyword:eight day", "material:oak", "period:georgian", "condition:good", "keyword:signed dial"],
    body: "Oak longcase with mahogany crossbanding, brass dial signed to the chapter ring, eight day movement striking on a bell. Weights, pendulum and one case key present.",
  },
  {
    tier: "market", title: "Hammered silver penny, clear mint mark", categoryId: "coins-medals",
    realisedPrice: 28000, currency: "GBP",
    terms: ["keyword:hammered", "keyword:mint mark", "condition:very fine", "material:silver", "period:medieval"],
    body: "Hammered silver penny, well struck with a clear mint signature and legible legends both sides. Small edge chip, attractive grey tone, uncleaned.",
  },
];

async function seedListings(
  db: Database,
  sellerId: string,
  curatorId: string,
  auctionId: string,
): Promise<void> {
  const curated = (curatorId: string) => ({
    curatorId,
    decidedAt: daysAgo(3),
    notes: "Marks legible in the photographs, condition honestly stated. Passed.",
    changesRequested: [] as string[],
    submittedAt: daysAgo(5),
    priority: true,
  });

  const base = {
    sellerId,
    status: "active" as const,
    currency: "GBP" as const,
    images: [],
    views: 0,
    watchers: [],
    autofilledFrom: null,
    researchSessionId: null,
    soldAt: null,
    soldPrice: null,
    boostedAt: null,
    extensions: 0,
    shipping: { domestic: 1500, international: 4500, collectionOnly: false },
  };

  // curation and auctionId are attached at insert time, below.
  const drafts: Omit<Listing, "id" | "createdAt" | "updatedAt" | "curation" | "auctionId">[] = [
    {
      ...base,
      title: "Regency rosewood card table, brass line inlay",
      subtitle: "Circa 1820 · swivel top on a turned column · 91cm wide",
      description:
        "A Regency card table in rosewood with brass line inlay to the frieze, the swivel top opening to a baize lined playing surface, raised on a turned column and quadruped base with brass caps and castors.\n\nHand-cut dovetails to the frieze, oak and deal secondary timbers. The brass inlay is complete with one short lifted section to the rear edge, photographed.\n\nColour is good and original. The baize is a later replacement. Sold as found and honestly described.",
      categoryId: "furniture-georgian",
      format: "buy" as const,
      price: 68000,
      startingBid: 0,
      reserve: 0,
      endsAt: null,
      attributes: {
        maker: "", period: "Regency, circa 1820", origin: "England",
        materials: ["Rosewood", "Brass", "Oak"], marks: "None",
        condition: "Good original colour. One lifted section of brass inlay to the rear edge. Later baize. Castors original.",
        conditionGrade: "good" as const, provenance: "Private collection, Sussex",
        dimensions: "91cm wide, 45cm deep, 74cm high", signed: false, restored: false,
      },
      seo: {
        metaTitle: "Regency Rosewood Card Table, Brass Inlay, c.1820",
        metaDescription: "Regency rosewood card table with brass line inlay, swivel top and quadruped base. Original colour, honestly described condition, 91cm wide.",
        keywords: ["regency card table", "rosewood", "brass inlay", "georgian furniture", "antique games table"],
        aiAssistedFields: [],
      },
    },
    {
      ...base,
      title: "Victorian silver christening mug, Birmingham 1874",
      subtitle: "Full hallmarks · engraved cartouche · 168 grams",
      description:
        "A Victorian silver christening mug with a scroll handle and an engraved foliate cartouche, hallmarked for Birmingham 1874 with a clear anchor, lion passant and date letter.\n\nThe cartouche carries a period monogram. Weight 168 grams, height 9cm.\n\nCondition is very good with no splits to the handle joins and no erasures to the body. Light surface scratching consistent with age and use.",
      categoryId: "silver-hallmarked",
      format: "bid" as const,
      price: 0,
      startingBid: 12000,
      reserve: 15000,
      endsAt: daysAhead(3),
      attributes: {
        maker: "", period: "Victorian, 1874", origin: "Birmingham",
        materials: ["Sterling silver"], marks: "Anchor, lion passant, date letter for 1874, maker's mark",
        condition: "Very good. No splits to the handle joins, no erasure. Light surface scratching.",
        conditionGrade: "very-good" as const, provenance: "", dimensions: "9cm high, 168 grams",
        signed: false, restored: false,
      },
      seo: {
        metaTitle: "Victorian Silver Christening Mug, Birmingham 1874",
        metaDescription: "Hallmarked Victorian silver christening mug, Birmingham 1874, engraved cartouche, 168 grams. Full marks photographed, very good condition.",
        keywords: ["victorian silver", "christening mug", "birmingham hallmark", "1874", "sterling silver"],
        aiAssistedFields: [],
      },
    },
    {
      ...base,
      title: "Studio stoneware bowl, impressed seal, ash glaze",
      subtitle: "Wood-fired stoneware · 26cm diameter · no faults",
      description:
        "A wide studio stoneware bowl under an ash glaze breaking to rust at the rim, with an impressed personal seal to the foot.\n\nThe foot is cleanly turned with the glaze wiped back, and the throwing rings are crisp across the interior. Body is a grogged stoneware, wood-fired.\n\nNo chips, cracks or restoration. 26cm across, 9cm high.",
      categoryId: "ceramics-pottery",
      format: "buy" as const,
      price: 24000,
      startingBid: 0,
      reserve: 0,
      endsAt: null,
      attributes: {
        maker: "", period: "20th century", origin: "",
        materials: ["Stoneware"], marks: "Impressed personal seal to the foot",
        condition: "Excellent. No chips, cracks or restoration.",
        conditionGrade: "excellent" as const, provenance: "",
        dimensions: "26cm diameter, 9cm high", signed: true, restored: false,
      },
      seo: {
        metaTitle: "Studio Stoneware Bowl, Ash Glaze, Impressed Seal",
        metaDescription: "Wood-fired studio stoneware bowl with ash glaze breaking rust at the rim and an impressed seal to the foot. 26cm across, no faults.",
        keywords: ["studio pottery", "stoneware bowl", "ash glaze", "impressed seal", "wood fired"],
        aiAssistedFields: [],
      },
    },
    {
      ...base,
      title: "Etching of a harbour, pencil signed, plate mark clear",
      subtitle: "On laid paper · plate 18 x 24cm · light marginal foxing",
      description:
        "An etching of a harbour scene on laid paper, signed in pencil in the lower margin, with a clearly embossed plate mark and chain lines visible against the light.\n\nUnder magnification the lines stand proud of the sheet, with no halftone rosette — an original etching rather than a reproduction.\n\nLight foxing to the margins only, image clean. Sheet 30 x 38cm, plate 18 x 24cm. Unframed.",
      categoryId: "art-prints",
      format: "bid" as const,
      price: 0,
      startingBid: 6000,
      reserve: 0,
      endsAt: daysAhead(3),
      attributes: {
        maker: "", period: "Early 20th century", origin: "",
        materials: ["Laid paper", "Etching ink"], marks: "Signed in pencil, lower margin",
        condition: "Light foxing to the margins, image clean. Unframed.",
        conditionGrade: "good" as const, provenance: "",
        dimensions: "Sheet 30 x 38cm, plate 18 x 24cm", signed: true, restored: false,
      },
      seo: {
        metaTitle: "Original Etching, Harbour Scene, Pencil Signed",
        metaDescription: "Original pencil-signed etching of a harbour on laid paper with a clear plate mark. Light marginal foxing, clean image, unframed.",
        keywords: ["original etching", "pencil signed print", "laid paper", "harbour scene", "antique print"],
        aiAssistedFields: [],
      },
    },
  ];

  for (const draft of drafts) {
    db.listings.push({
      ...draft,
      id: newId("lst"),
      curation: curated(curatorId),
      // Auction lots belong to the current curated sale; buy-it-now does not.
      auctionId: draft.format === "bid" ? auctionId : null,
      createdAt: daysAgo(6),
      updatedAt: daysAgo(2),
    });
  }
}

let seeding: Promise<void> | null = null;

/** Idempotent. Every server entry point calls this before reading. */
export async function ensureSeeded(): Promise<void> {
  const populated = await read((db) => db.users.length > 0 || db.researchDocs.length > 0);
  if (populated) return;
  // Concurrent requests on a cold start must not seed twice.
  seeding ??= runSeed().finally(() => {
    seeding = null;
  });
  return seeding;
}

async function runSeed(): Promise<void> {
  const admin = await hashPassword("mintedup-admin-2026");
  const curator = await hashPassword("curator-demo-2026");
  const seller = await hashPassword("dealer-demo-2026");
  const taster = await hashPassword("taster-demo-2026");

  await mutate(async (db) => {
    if (db.users.length > 0 || db.researchDocs.length > 0) return;

    const adminUser: User = {
      id: newId("usr"), email: "admin@mintedup.example", handle: "mintedup",
      displayName: "Minted Up", role: "admin",
      passwordHash: admin.hash, passwordSalt: admin.salt,
      shop: {
        name: "Minted Up", slug: "mintedup", tagline: "House account",
        about: "", location: "", bannerColour: "#d8b45a", specialties: [],
        returnsPolicy: "", shippingPolicy: "",
      },
      membership: {
        tier: "shop", status: "active", since: daysAgo(60),
        renewsAt: daysAhead(30), cancelledAt: null,
      },
      usage: { month: currentMonth(), aiSeo: 0, autocomplete: 0 },
      freeListingsRemaining: 0, verified: true, invitedBy: null,
      createdAt: daysAgo(60), suspended: false,
    };

    const curatorUser: User = {
      id: newId("usr"), email: "curator@mintedup.example", handle: "curation",
      displayName: "Curation Desk", role: "curator",
      passwordHash: curator.hash, passwordSalt: curator.salt,
      shop: {
        name: "Curation Desk", slug: "curation-desk", tagline: "House account",
        about: "", location: "", bannerColour: "#4f9b86", specialties: [],
        returnsPolicy: "", shippingPolicy: "",
      },
      membership: {
        tier: "shop", status: "active", since: daysAgo(55),
        renewsAt: daysAhead(30), cancelledAt: null,
      },
      usage: { month: currentMonth(), aiSeo: 0, autocomplete: 0 },
      freeListingsRemaining: 0, verified: true, invitedBy: null,
      createdAt: daysAgo(55), suspended: false,
    };

    const sellerUser: User = {
      id: newId("usr"), email: "dealer@mintedup.example", handle: "hallmark-row",
      displayName: "Hallmark Row", role: "user",
      passwordHash: seller.hash, passwordSalt: seller.salt,
      shop: {
        name: "Hallmark Row", slug: "hallmark-row",
        tagline: "Georgian and Victorian silver, ceramics and country furniture",
        about: "A small dealership working out of a market town, buying at house sales and clearing single-owner collections. Everything is described with its faults.",
        location: "Ludlow, Shropshire",
        bannerColour: "#b8863b",
        specialties: ["silver-hallmarked", "furniture-georgian", "ceramics-pottery"],
        returnsPolicy: "14-day returns, buyer pays return shipping unless misdescribed.",
        shippingPolicy: "Fully insured and tracked. Furniture by specialist carrier, quoted per lot.",
      },
      membership: {
        tier: "shop", status: "active", since: daysAgo(45),
        renewsAt: daysAhead(12), cancelledAt: null,
      },
      usage: { month: currentMonth(), aiSeo: 0, autocomplete: 0 },
      freeListingsRemaining: 0, verified: true, invitedBy: null,
      createdAt: daysAgo(45), suspended: false,
    };

    const tasterUser: User = {
      id: newId("usr"), email: "taster@mintedup.example", handle: "attic-finds",
      displayName: "Attic Finds", role: "user",
      passwordHash: taster.hash, passwordSalt: taster.salt,
      shop: {
        name: "Attic Finds", slug: "attic-finds",
        tagline: "Clearing a family house, one box at a time",
        about: "", location: "Norwich", bannerColour: "#d8b45a", specialties: [],
        returnsPolicy: "14-day returns on all items unless described otherwise.",
        shippingPolicy: "Tracked and insured.",
      },
      membership: {
        tier: "free", status: "active", since: daysAgo(9),
        renewsAt: null, cancelledAt: null,
      },
      usage: { month: currentMonth(), aiSeo: 2, autocomplete: 1 },
      freeListingsRemaining: FREE_LISTING_ALLOWANCE, verified: false,
      invitedBy: adminUser.id,
      createdAt: daysAgo(9), suspended: false,
    };

    db.users.push(adminUser, curatorUser, sellerUser, tasterUser);

    const auction: CuratedAuction = {
      id: newId("auc"),
      title: "Silver, Ceramics & Country Furniture",
      strapline: "A curated sale of eighty lots, closing Sunday evening",
      description:
        "Our weekly general sale. Every lot has been read by a curator against the photographs: marks confirmed as legible, condition faults declared, and attributions checked against the evidence rather than the hope. Bidding closes lot by lot from 7pm, with the closing clock extending on every late bid.",
      categoryIds: ["silver-hallmarked", "ceramics-pottery", "furniture-georgian", "art-prints"],
      opensAt: daysAgo(2),
      closesAt: daysAhead(3),
      status: "live",
      curatorId: curatorUser.id,
      createdAt: daysAgo(7),
    };
    db.auctions.push(auction);

    for (const doc of [...REFERENCE, ...MARKET]) {
      db.researchDocs.push({
        ...doc,
        id: newId("doc"),
        currency: doc.currency ?? null,
        sourceListingId: null,
        contributedBy: null,
        weight: doc.tier === "reference" ? 3 : 1,
        createdAt: daysAgo(30),
      });
    }

    await seedListings(db, sellerUser.id, curatorUser.id, auction.id);
  });
}

export const DEMO_ACCOUNTS = [
  { email: "admin@mintedup.example", password: "mintedup-admin-2026", role: "Administrator" },
  { email: "curator@mintedup.example", password: "curator-demo-2026", role: "Curator" },
  { email: "dealer@mintedup.example", password: "dealer-demo-2026", role: "Shop member (£20/mo)" },
  { email: "taster@mintedup.example", password: "taster-demo-2026", role: "Free member (5 listings)" },
];
