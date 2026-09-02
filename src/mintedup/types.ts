/**
 * Minted Up — domain types.
 *
 * Everything in the marketplace is scoped to antiques and collectibles. The
 * taxonomy in `categories.ts` is the only vocabulary listings may use.
 */

export type Role = "user" | "curator" | "admin";

/**
 * Minted Up is invite-only. `free` members are approved applicants on a taster
 * allowance; `shop` members pay the monthly subscription. See membership.ts for
 * what each tier is entitled to.
 */
export type Tier = "free" | "shop";

export type Membership = {
  tier: Tier;
  status: "active" | "lapsed" | "cancelled";
  since: string;
  /** Next billing date for a shop member; null on the free tier. */
  renewsAt: string | null;
  cancelledAt: string | null;
};

/** Metered features, reset when `month` rolls over. */
export type Usage = {
  month: string;
  aiSeo: number;
  autocomplete: number;
};

export type User = {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  passwordSalt: string;
  shop: Shop;
  membership: Membership;
  usage: Usage;
  /** Taster allowance. Decremented on publish; ignored on the shop tier. */
  freeListingsRemaining: number;
  /** Set by a curator once the seller has a track record. */
  verified: boolean;
  invitedBy: string | null;
  createdAt: string;
  suspended: boolean;
};

export type Shop = {
  name: string;
  slug: string;
  tagline: string;
  about: string;
  location: string;
  /** Shop-tier customisation. */
  bannerColour: string;
  /** Specialisms, drawn from the category taxonomy. Powers shop-level SEO. */
  specialties: string[];
  returnsPolicy: string;
  shippingPolicy: string;
};

export type ListingFormat = "buy" | "bid";

/**
 * Minted Up runs curated sales: nothing reaches the catalogue without a curator
 * passing it. `draft` -> `submitted` -> `approved` -> `active`, with `changes`
 * and `rejected` as the two ways back.
 */
export type ListingStatus =
  | "draft"
  | "submitted"
  | "changes"
  | "rejected"
  | "approved"
  | "active"
  | "sold"
  | "ended"
  | "removed";

export type Curation = {
  curatorId: string | null;
  decidedAt: string | null;
  /** Shown to the seller verbatim, so it must be written to be read by them. */
  notes: string;
  /** What the curator asked to be changed before resubmission. */
  changesRequested: string[];
  submittedAt: string | null;
  /** Shop members are curated first. */
  priority: boolean;
};

/**
 * A themed, scheduled sale. Lots are grouped into one so the catalogue reads
 * like a saleroom calendar rather than an endless feed.
 */
export type CuratedAuction = {
  id: string;
  title: string;
  strapline: string;
  description: string;
  categoryIds: string[];
  opensAt: string;
  closesAt: string;
  status: "scheduled" | "live" | "closed";
  curatorId: string | null;
  createdAt: string;
};

/** Result of the high-end image gate. Stored so admin can audit decisions. */
export type ImageQuality = {
  width: number;
  height: number;
  megapixels: number;
  bytes: number;
  format: "jpeg" | "png" | "webp";
  /** Bytes of file per pixel — low values betray an upscaled or re-compressed file. */
  bytesPerPixel: number;
  /** 0-100. Client-measured Laplacian variance, normalised. Absent for API uploads. */
  sharpness: number | null;
  score: number;
  accepted: boolean;
  failures: string[];
  warnings: string[];
};

export type ListingImage = {
  id: string;
  /** Slot index 0-29 on the composer grid. */
  slot: number;
  filename: string;
  mediaType: string;
  quality: ImageQuality;
  alt: string;
  uploadedAt: string;
};

export type Bid = {
  id: string;
  listingId: string;
  bidderId: string;
  amount: number;
  placedAt: string;
  /** Highest the bidder is willing to go; the engine bids up to this on their behalf. */
  maxAmount: number;
  retracted: boolean;
};

export type Order = {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  format: ListingFormat;
  placedAt: string;
  status: "paid" | "shipped" | "delivered" | "refunded";
};

export type ListingAttributes = {
  maker: string;
  period: string;
  origin: string;
  materials: string[];
  marks: string;
  condition: string;
  conditionGrade: ConditionGrade;
  provenance: string;
  dimensions: string;
  signed: boolean;
  restored: boolean;
};

export type ConditionGrade =
  | "mint"
  | "excellent"
  | "very-good"
  | "good"
  | "fair"
  | "restoration-project";

export type Listing = {
  id: string;
  sellerId: string;
  title: string;
  subtitle: string;
  description: string;
  categoryId: string;
  format: ListingFormat;
  status: ListingStatus;
  /** Buy-it-now price, in minor units (pence/cents). */
  price: number;
  /** Auction opening bid, in minor units. */
  startingBid: number;
  reserve: number;
  currency: "GBP" | "USD" | "EUR";
  /** ISO date; auctions only. */
  endsAt: string | null;
  images: ListingImage[];
  attributes: ListingAttributes;
  seo: {
    metaTitle: string;
    metaDescription: string;
    keywords: string[];
    /** Which fields were generated by the AI SEO assistant, for disclosure. */
    aiAssistedFields: string[];
  };
  /** Set when the beta auto-complete drafted this listing from its images. */
  autofilledFrom: string | null;
  researchSessionId: string | null;
  curation: Curation;
  /** The curated sale this lot belongs to; auctions only. */
  auctionId: string | null;
  /** Shop-tier promotion: boosted lots sort first in the catalogue. */
  boostedAt: string | null;
  /** How many times the closing time has been extended by a late bid. */
  extensions: number;
  shipping: { domestic: number; international: number; collectionOnly: boolean };
  views: number;
  watchers: string[];
  createdAt: string;
  updatedAt: string;
  soldAt: string | null;
  soldPrice: number | null;
};

/* ------------------------------------------------------------------ *
 * Research gateway
 * ------------------------------------------------------------------ */

export type SignalType =
  | "mark"
  | "maker"
  | "material"
  | "form"
  | "motif"
  | "period"
  | "origin"
  | "condition"
  | "dimension"
  | "keyword";

/**
 * One observation about an object. `source` and `confidence` decide how much
 * weight the learning engine gives it — see `research.ts`.
 */
export type ResearchSignal = {
  id: string;
  type: SignalType;
  value: string;
  source: "user" | "ai" | "confirmed" | "rejected";
  confidence: number;
  notedAt: string;
};

export type ResearchSession = {
  id: string;
  userId: string;
  title: string;
  categoryId: string | null;
  notes: string;
  signals: ResearchSignal[];
  queries: string[];
  /** Set once the seller turns the research into a listing. */
  listingId: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * A document in the searchable research corpus. Documents come from three
 * places, and `tier` decides which wins when they disagree.
 */
export type ResearchDoc = {
  id: string;
  /** reference = curated/editorial, market = a real sale, community = user research. */
  tier: "reference" | "market" | "community";
  title: string;
  body: string;
  categoryId: string;
  terms: string[];
  /** Realised sale price in minor units, when this doc records an outcome. */
  realisedPrice: number | null;
  currency: "GBP" | "USD" | "EUR" | null;
  sourceListingId: string | null;
  contributedBy: string | null;
  /** Aggregate of the feedback events pointing at this doc. */
  weight: number;
  createdAt: string;
};

/**
 * Append-only log. Every interaction in the research gateway lands here, and
 * the index is rebuilt from it. Nothing else is allowed to mutate learned
 * state, so the whole model is reproducible from this one table.
 */
export type LearningEvent = {
  id: string;
  sessionId: string | null;
  userId: string | null;
  kind:
    | "query"
    | "suggestion_shown"
    | "suggestion_accepted"
    | "suggestion_rejected"
    | "signal_added"
    | "listing_published"
    | "sale_outcome"
    | "no_sale_outcome";
  terms: string[];
  categoryId: string | null;
  docId: string | null;
  /** Realised price in minor units for outcome events. */
  value: number | null;
  weight: number;
  createdAt: string;
};

/** An application to join. Minted Up does not take open registrations. */
export type Application = {
  id: string;
  email: string;
  name: string;
  /** What they deal in, in their own words. */
  dealing: string;
  links: string;
  status: "pending" | "approved" | "rejected";
  notes: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

/** Issued on approval. One code, one email, one use. */
export type Invite = {
  code: string;
  email: string;
  applicationId: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
};

/**
 * Accrued fees and charges.
 *
 * NOTE: this is a ledger, not a payment processor. Nothing here moves money —
 * entries record what a seller owes or has been charged so the numbers are
 * right when a real processor is wired in. See docs/mintedup/README.md.
 */
export type LedgerEntry = {
  id: string;
  userId: string;
  kind: "listing_fee" | "commission" | "subscription" | "credit";
  /** Minor units. Positive is owed to Minted Up, negative is a credit. */
  amount: number;
  currency: "GBP";
  description: string;
  listingId: string | null;
  orderId: string | null;
  createdAt: string;
};

export type Session = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

export type Database = {
  users: User[];
  listings: Listing[];
  bids: Bid[];
  orders: Order[];
  sessions: Session[];
  researchSessions: ResearchSession[];
  researchDocs: ResearchDoc[];
  learningEvents: LearningEvent[];
  applications: Application[];
  invites: Invite[];
  ledger: LedgerEntry[];
  auctions: CuratedAuction[];
};
