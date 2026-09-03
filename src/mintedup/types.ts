/** Minted Up domain types. */
export type Role = "user" | "curator" | "admin";
export type Tier = "free" | "shop";
export type Membership = { tier: Tier; status: "active" | "lapsed" | "cancelled"; since: string; renewsAt: string | null; cancelledAt: string | null };
export type Usage = { month: string; aiSeo: number; autocomplete: number };
export type User = { id: string; email: string; handle: string; displayName: string; role: Role; passwordHash: string; passwordSalt: string; shop: Shop; membership: Membership; usage: Usage; freeListingsRemaining: number; verified: boolean; invitedBy: string | null; createdAt: string; suspended: boolean };
export type Shop = { name: string; slug: string; tagline: string; about: string; location: string; bannerColour: string; specialties: string[]; returnsPolicy: string; shippingPolicy: string };
export type ListingFormat = "buy" | "bid";
export type ListingStatus = "draft" | "submitted" | "changes" | "rejected" | "approved" | "active" | "sold" | "ended" | "removed";
export type Curation = { curatorId: string | null; decidedAt: string | null; notes: string; changesRequested: string[]; submittedAt: string | null; priority: boolean };
export type CuratedAuction = { id: string; title: string; strapline: string; description: string; categoryIds: string[]; opensAt: string; closesAt: string; status: "scheduled" | "live" | "closed"; curatorId: string | null; createdAt: string };
export type ImageQuality = { width: number; height: number; megapixels: number; bytes: number; format: "jpeg" | "png" | "webp"; bytesPerPixel: number; sharpness: number | null; score: number; accepted: boolean; failures: string[]; warnings: string[] };
export type ListingImage = { id: string; slot: number; filename: string; mediaType: string; quality: ImageQuality; alt: string; uploadedAt: string };
export type Bid = { id: string; listingId: string; bidderId: string; amount: number; placedAt: string; maxAmount: number; retracted: boolean };

/** Payment truth is added orthogonally so existing order/listing status consumers remain compatible. */
export type PaymentStatus = "awaiting_payment" | "confirmed" | "cancelled";
export type Order = {
  id: string; listingId: string; buyerId: string; sellerId: string; amount: number; format: ListingFormat; placedAt: string;
  status: "paid" | "shipped" | "delivered" | "refunded";
  paymentStatus?: PaymentStatus;
  paymentReference?: string | null;
  paymentConfirmedAt?: string | null;
  cancelledAt?: string | null;
};

export type ListingAttributes = { maker: string; period: string; origin: string; materials: string[]; marks: string; condition: string; conditionGrade: ConditionGrade; provenance: string; dimensions: string; signed: boolean; restored: boolean };
export type ConditionGrade = "mint" | "excellent" | "very-good" | "good" | "fair" | "restoration-project";
export type Listing = {
  id: string; sellerId: string; title: string; subtitle: string; description: string; categoryId: string; format: ListingFormat; status: ListingStatus; price: number; startingBid: number; reserve: number; currency: "GBP" | "USD" | "EUR"; endsAt: string | null; images: ListingImage[]; attributes: ListingAttributes;
  seo: { metaTitle: string; metaDescription: string; keywords: string[]; aiAssistedFields: string[] };
  autofilledFrom: string | null; researchSessionId: string | null; curation: Curation; auctionId: string | null; boostedAt: string | null; extensions: number;
  /** Order currently holding this lot while payment is unresolved. */
  reservedOrderId?: string | null;
  shipping: { domestic: number; international: number; collectionOnly: boolean }; views: number; watchers: string[]; createdAt: string; updatedAt: string; soldAt: string | null; soldPrice: number | null;
};
export type SignalType = "mark" | "maker" | "material" | "form" | "motif" | "period" | "origin" | "condition" | "dimension" | "keyword";
export type ResearchSignal = { id: string; type: SignalType; value: string; source: "user" | "ai" | "confirmed" | "rejected"; confidence: number; notedAt: string };
export type ResearchSession = { id: string; userId: string; title: string; categoryId: string | null; notes: string; signals: ResearchSignal[]; queries: string[]; listingId: string | null; createdAt: string; updatedAt: string };
export type ResearchDoc = { id: string; tier: "reference" | "market" | "community"; title: string; body: string; categoryId: string; terms: string[]; realisedPrice: number | null; currency: "GBP" | "USD" | "EUR" | null; sourceListingId: string | null; contributedBy: string | null; weight: number; createdAt: string };
export type LearningEvent = { id: string; sessionId: string | null; userId: string | null; kind: "query" | "suggestion_shown" | "suggestion_accepted" | "suggestion_rejected" | "signal_added" | "listing_published" | "sale_outcome" | "no_sale_outcome"; terms: string[]; categoryId: string | null; docId: string | null; value: number | null; weight: number; createdAt: string };
export type Application = { id: string; email: string; name: string; dealing: string; links: string; status: "pending" | "approved" | "rejected"; notes: string; decidedBy: string | null; decidedAt: string | null; createdAt: string };
export type Invite = { code: string; email: string; applicationId: string | null; createdBy: string; createdAt: string; expiresAt: string; usedAt: string | null; usedBy: string | null };
export type LedgerEntry = { id: string; userId: string; kind: "listing_fee" | "commission" | "subscription" | "credit"; amount: number; currency: "GBP"; description: string; listingId: string | null; orderId: string | null; createdAt: string };
export type Session = { token: string; userId: string; createdAt: string; expiresAt: string };
export type Database = { users: User[]; listings: Listing[]; bids: Bid[]; orders: Order[]; sessions: Session[]; researchSessions: ResearchSession[]; researchDocs: ResearchDoc[]; learningEvents: LearningEvent[]; applications: Application[]; invites: Invite[]; ledger: LedgerEntry[]; auctions: CuratedAuction[] };
