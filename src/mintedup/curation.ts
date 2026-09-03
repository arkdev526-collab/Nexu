import { chargeListingFee } from "./billing";
import { CURATION_CHECKLIST } from "./curation-rules";
import { isShopMember } from "./membership";
import { contributeListing } from "./research";
import { mutate, newId, read } from "./store";
import type { CuratedAuction, Listing, User } from "./types";

/**
 * Curation.
 *
 * Minted Up runs curated sales, not an open feed: a curator reads every lot
 * before it reaches the catalogue, the way a specialist auction house vets
 * consignments. That gate is the product — it is what a buyer is paying the
 * commission for and what a seller is paying the subscription to be admitted to.
 *
 * A lot moves draft -> submitted -> approved -> active, with `changes` (fixable)
 * and `rejected` (not) as the two ways back. Nothing publishes itself.
 */

export { CURATION_CHECKLIST };

export class CurationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "CurationError";
  }
}

/* ------------------------------------------------------------------ *
 * Submission
 * ------------------------------------------------------------------ */

export async function submitForCuration(listingId: string, seller: User): Promise<Listing> {
  return mutate((db) => {
    const listing = db.listings.find((l) => l.id === listingId);
    if (!listing) throw new CurationError("Listing not found.", 404);
    if (listing.sellerId !== seller.id) throw new CurationError("That is not your listing.", 403);
    if (listing.status === "submitted") {
      throw new CurationError("This lot is already with a curator.", 409);
    }
    if (listing.status === "active" || listing.status === "sold") {
      throw new CurationError("This lot has already been through curation.", 409);
    }

    const now = new Date().toISOString();
    listing.status = "submitted";
    listing.curation = {
      ...listing.curation,
      submittedAt: now,
      // Shop members are curated first — it is one of the things they pay for.
      priority: isShopMember(seller),
      changesRequested: [],
    };
    listing.updatedAt = now;
    return structuredClone(listing);
  });
}

/* ------------------------------------------------------------------ *
 * The queue
 * ------------------------------------------------------------------ */

export type QueueItem = {
  listing: Listing;
  sellerName: string;
  sellerTier: string;
  waitingHours: number;
};

export async function curationQueue(): Promise<QueueItem[]> {
  return read((db) =>
    db.listings
      .filter((l) => l.status === "submitted")
      .map((listing) => {
        const seller = db.users.find((u) => u.id === listing.sellerId);
        const submitted = listing.curation.submittedAt;
        return {
          listing,
          sellerName: seller?.shop.name ?? "Unknown",
          sellerTier: seller?.membership.tier ?? "free",
          waitingHours: submitted
            ? Math.round((Date.now() - Date.parse(submitted)) / 36e5)
            : 0,
        };
      })
      // Priority first, then oldest — a shop member never waits behind a free
      // submission, and within a tier it is strictly first come first served.
      .sort((a, b) => {
        if (a.listing.curation.priority !== b.listing.curation.priority) {
          return a.listing.curation.priority ? -1 : 1;
        }
        return (
          Date.parse(a.listing.curation.submittedAt ?? "") -
          Date.parse(b.listing.curation.submittedAt ?? "")
        );
      }),
  );
}

/* ------------------------------------------------------------------ *
 * Decisions
 * ------------------------------------------------------------------ */

/**
 * Approve a lot into the catalogue. Buy-it-now goes live immediately; an
 * auction lot must be placed in a curated sale, and takes that sale's closing
 * time as its own.
 */
export async function approveListing(input: {
  listingId: string;
  curatorId: string;
  notes: string;
  auctionId?: string | null;
}): Promise<Listing> {
  const { listing, seller } = await mutate((db) => {
    const found = db.listings.find((l) => l.id === input.listingId);
    if (!found) throw new CurationError("Listing not found.", 404);
    if (found.status !== "submitted" && found.status !== "changes") {
      throw new CurationError("Only a submitted lot can be approved.", 409);
    }

    const now = new Date().toISOString();

    if (found.format === "bid") {
      const auctionId = input.auctionId ?? found.auctionId;
      const auction = db.auctions.find((a) => a.id === auctionId);
      if (!auction) {
        throw new CurationError("Place this lot in a curated sale before approving it.", 422);
      }
      if (auction.status === "closed") {
        throw new CurationError("That sale has already closed.", 422);
      }
      found.auctionId = auction.id;
      // The lot closes with its sale, subject to the bidding extensions.
      found.endsAt = auction.closesAt;
    }

    found.status = "active";
    found.curation = {
      curatorId: input.curatorId,
      decidedAt: now,
      notes: input.notes,
      changesRequested: [],
      submittedAt: found.curation.submittedAt,
      priority: found.curation.priority,
    };
    found.updatedAt = now;

    const sellerRecord = db.users.find((u) => u.id === found.sellerId);
    return { listing: structuredClone(found), seller: sellerRecord ? structuredClone(sellerRecord) : null };
  });

  // The listing fee falls due when the lot actually reaches the catalogue, not
  // when it was submitted — a rejected lot is never charged for.
  if (seller) await chargeListingFee(seller, listing.id);
  // And the research corpus learns from it the moment it goes live.
  await contributeListing(listing);
  return listing;
}

export async function requestChanges(input: {
  listingId: string;
  curatorId: string;
  notes: string;
  changes: string[];
}): Promise<Listing> {
  return mutate((db) => {
    const listing = db.listings.find((l) => l.id === input.listingId);
    if (!listing) throw new CurationError("Listing not found.", 404);
    const now = new Date().toISOString();
    listing.status = "changes";
    listing.curation = {
      ...listing.curation,
      curatorId: input.curatorId,
      decidedAt: now,
      notes: input.notes,
      changesRequested: input.changes.filter(Boolean).slice(0, 12),
    };
    listing.updatedAt = now;
    return structuredClone(listing);
  });
}

export async function rejectListing(input: {
  listingId: string;
  curatorId: string;
  notes: string;
}): Promise<Listing> {
  return mutate((db) => {
    const listing = db.listings.find((l) => l.id === input.listingId);
    if (!listing) throw new CurationError("Listing not found.", 404);
    const now = new Date().toISOString();
    listing.status = "rejected";
    listing.curation = {
      ...listing.curation,
      curatorId: input.curatorId,
      decidedAt: now,
      notes: input.notes,
      changesRequested: [],
    };
    listing.updatedAt = now;
    return structuredClone(listing);
  });
}

/* ------------------------------------------------------------------ *
 * Curated sales
 * ------------------------------------------------------------------ */

export async function createAuction(input: {
  title: string;
  strapline: string;
  description: string;
  categoryIds: string[];
  opensAt: string;
  closesAt: string;
  curatorId: string;
}): Promise<CuratedAuction> {
  if (Date.parse(input.closesAt) <= Date.parse(input.opensAt)) {
    throw new CurationError("A sale must close after it opens.", 400);
  }
  const auction: CuratedAuction = {
    id: newId("auc"),
    title: input.title.trim().slice(0, 160),
    strapline: input.strapline.trim().slice(0, 200),
    description: input.description.trim().slice(0, 4000),
    categoryIds: input.categoryIds,
    opensAt: input.opensAt,
    closesAt: input.closesAt,
    status: "scheduled",
    curatorId: input.curatorId,
    createdAt: new Date().toISOString(),
  };
  await mutate((db) => {
    db.auctions.push(auction);
  });
  return auction;
}

/** Roll every sale's status forward. Cheap, and called wherever sales are read. */
export async function refreshAuctionStatuses(): Promise<void> {
  const stale = await read((db) =>
    db.auctions.some((a) => a.status !== derivedStatus(a)),
  );
  if (!stale) return;
  await mutate((db) => {
    for (const auction of db.auctions) auction.status = derivedStatus(auction);
  });
}

function derivedStatus(auction: CuratedAuction): CuratedAuction["status"] {
  const now = Date.now();
  if (now < Date.parse(auction.opensAt)) return "scheduled";
  if (now >= Date.parse(auction.closesAt)) return "closed";
  return "live";
}

export async function auctionsWithCounts(): Promise<
  (CuratedAuction & { lotCount: number; liveLotCount: number })[]
> {
  return read((db) =>
    db.auctions
      .map((auction) => ({
        ...auction,
        lotCount: db.listings.filter((l) => l.auctionId === auction.id).length,
        liveLotCount: db.listings.filter(
          (l) => l.auctionId === auction.id && l.status === "active",
        ).length,
      }))
      .sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt)),
  );
}
