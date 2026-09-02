import { formatMoney } from "./format";
import { contributeListing, recordOutcome } from "./research";
import { mutate, newId, read } from "./store";
import type { Bid, Listing, Order } from "./types";

/**
 * Sale mechanics: buy-it-now, and a proxy auction of the kind collectors
 * expect — you enter your maximum, the engine bids the minimum needed to keep
 * you in front, and your maximum is never revealed.
 */

export class ListingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ListingError";
  }
}

/** Standard auction increments. Bids are rounded up to the next valid step. */
export function bidIncrement(current: number): number {
  if (current < 5000) return 100;
  if (current < 20000) return 250;
  if (current < 100000) return 500;
  if (current < 500000) return 2500;
  return 10000;
}

export function currentBid(listing: Listing, bids: Bid[]): { amount: number; bidderId: string | null; count: number } {
  const live = bids
    .filter((b) => b.listingId === listing.id && !b.retracted)
    .sort((a, b) => a.amount - b.amount || Date.parse(a.placedAt) - Date.parse(b.placedAt));
  const top = live.at(-1);
  return {
    amount: top ? top.amount : listing.startingBid,
    bidderId: top ? top.bidderId : null,
    count: live.length,
  };
}

export function minimumBid(listing: Listing, bids: Bid[]): number {
  const { amount, count } = currentBid(listing, bids);
  return count === 0 ? listing.startingBid : amount + bidIncrement(amount);
}

export function isLive(listing: Listing): boolean {
  if (listing.status !== "active") return false;
  if (listing.format === "bid" && listing.endsAt) return Date.parse(listing.endsAt) > Date.now();
  return true;
}

/**
 * Place a proxy bid. `maxAmount` is the ceiling the bidder authorises; the
 * visible bid moves to one increment above the runner-up, or to the ceiling if
 * the two ceilings are close.
 */
export async function placeBid(input: {
  listingId: string;
  bidderId: string;
  maxAmount: number;
}): Promise<{ bid: Bid; visibleAmount: number; leading: boolean }> {
  return mutate((db) => {
    const listing = db.listings.find((l) => l.id === input.listingId);
    if (!listing) throw new ListingError("Listing not found.", 404);
    if (listing.format !== "bid") throw new ListingError("This listing is not an auction.");
    if (!isLive(listing)) throw new ListingError("Bidding on this lot has closed.");
    if (listing.sellerId === input.bidderId) {
      throw new ListingError("You cannot bid on your own lot.");
    }

    const live = db.bids.filter((b) => b.listingId === listing.id && !b.retracted);
    const floor = live.length === 0
      ? listing.startingBid
      : Math.max(...live.map((b) => b.amount)) + bidIncrement(Math.max(...live.map((b) => b.amount)));

    if (input.maxAmount < floor) {
      throw new ListingError(`The next valid bid is ${formatMoney(floor, listing.currency)}.`);
    }

    // Whoever holds the higher ceiling leads; the visible price is one
    // increment over the loser's ceiling, capped at the winner's ceiling.
    const standingMax = live.length ? Math.max(...live.map((b) => b.maxAmount)) : 0;
    const standingLeader = live.find((b) => b.maxAmount === standingMax) ?? null;
    const bidderLeads = input.maxAmount > standingMax;
    let visibleAmount = bidderLeads
      ? Math.min(input.maxAmount, Math.max(floor, standingMax + bidIncrement(standingMax)))
      : Math.min(standingMax, input.maxAmount + bidIncrement(input.maxAmount));

    // A proxy bid that authorises the reserve meets it, as it would in the room.
    // Without this a reserved lot with a single willing bidder ends unsold even
    // though that bidder had given the auctioneer enough to sell it.
    const leadingMax = Math.max(input.maxAmount, standingMax);
    if (listing.reserve > 0 && leadingMax >= listing.reserve && visibleAmount < listing.reserve) {
      visibleAmount = listing.reserve;
    }

    const bid: Bid = {
      id: newId("bid"),
      listingId: listing.id,
      bidderId: input.bidderId,
      amount: bidderLeads ? visibleAmount : input.maxAmount,
      maxAmount: input.maxAmount,
      placedAt: new Date().toISOString(),
      retracted: false,
    };
    db.bids.push(bid);

    // The outbid leader's proxy answers immediately, as it would at auction.
    if (!bidderLeads && standingLeader) {
      db.bids.push({
        id: newId("bid"),
        listingId: listing.id,
        bidderId: standingLeader.bidderId,
        amount: visibleAmount,
        maxAmount: standingMax,
        placedAt: new Date().toISOString(),
        retracted: false,
      });
    }

    // Anti-sniping: a bid inside the last five minutes extends the lot.
    if (listing.endsAt) {
      const remaining = Date.parse(listing.endsAt) - Date.now();
      if (remaining < 5 * 60_000) {
        listing.endsAt = new Date(Date.now() + 5 * 60_000).toISOString();
      }
    }
    listing.updatedAt = new Date().toISOString();

    return { bid, visibleAmount, leading: bidderLeads };
  });
}

export async function buyNow(input: { listingId: string; buyerId: string }): Promise<Order> {
  const { order, listing } = await mutate((db) => {
    const listing = db.listings.find((l) => l.id === input.listingId);
    if (!listing) throw new ListingError("Listing not found.", 404);
    if (listing.format !== "buy") throw new ListingError("This lot is sold by auction.");
    if (!isLive(listing)) throw new ListingError("This listing is no longer available.");
    if (listing.sellerId === input.buyerId) {
      throw new ListingError("You cannot buy your own listing.");
    }

    const order: Order = {
      id: newId("ord"),
      listingId: listing.id,
      buyerId: input.buyerId,
      sellerId: listing.sellerId,
      amount: listing.price,
      format: "buy",
      placedAt: new Date().toISOString(),
      status: "paid",
    };
    db.orders.push(order);
    listing.status = "sold";
    listing.soldAt = order.placedAt;
    listing.soldPrice = order.amount;
    listing.updatedAt = order.placedAt;
    return { order, listing: structuredClone(listing) };
  });

  // Loop 4: tell the research engine what the market paid.
  await recordOutcome(listing, { sold: true, price: order.amount });
  return order;
}

/** Close an auction that has run out of time, honouring the reserve. */
export async function settleAuction(listingId: string): Promise<Order | null> {
  const outcome = await mutate((db) => {
    const listing = db.listings.find((l) => l.id === listingId);
    if (!listing || listing.format !== "bid" || listing.status !== "active") return null;
    if (listing.endsAt && Date.parse(listing.endsAt) > Date.now()) return null;

    const live = db.bids.filter((b) => b.listingId === listing.id && !b.retracted);
    const top = live.sort((a, b) => a.amount - b.amount).at(-1);
    const now = new Date().toISOString();

    if (!top || top.amount < listing.reserve) {
      listing.status = "ended";
      listing.updatedAt = now;
      return { order: null, listing: structuredClone(listing) };
    }

    const order: Order = {
      id: newId("ord"),
      listingId: listing.id,
      buyerId: top.bidderId,
      sellerId: listing.sellerId,
      amount: top.amount,
      format: "bid",
      placedAt: now,
      status: "paid",
    };
    db.orders.push(order);
    listing.status = "sold";
    listing.soldAt = now;
    listing.soldPrice = top.amount;
    listing.updatedAt = now;
    return { order, listing: structuredClone(listing) };
  });

  if (!outcome) return null;
  await recordOutcome(outcome.listing, {
    sold: Boolean(outcome.order),
    price: outcome.order?.amount ?? null,
  });
  return outcome.order;
}

/** Settle every auction whose clock has run out. Called on browse/detail views. */
export async function settleDueAuctions(): Promise<void> {
  const due = await read((db) =>
    db.listings
      .filter(
        (l) =>
          l.format === "bid" &&
          l.status === "active" &&
          l.endsAt !== null &&
          Date.parse(l.endsAt) <= Date.now(),
      )
      .map((l) => l.id),
  );
  for (const id of due) await settleAuction(id);
}

export async function publishListing(listingId: string, sellerId: string): Promise<Listing> {
  const listing = await mutate((db) => {
    const found = db.listings.find((l) => l.id === listingId);
    if (!found) throw new ListingError("Listing not found.", 404);
    if (found.sellerId !== sellerId) throw new ListingError("That is not your listing.", 403);

    const problems = validateForPublish(found);
    if (problems.length) throw new ListingError(problems.join(" "), 422);

    found.status = "active";
    found.updatedAt = new Date().toISOString();
    if (found.format === "bid" && !found.endsAt) {
      found.endsAt = new Date(Date.now() + 7 * 864e5).toISOString();
    }
    return structuredClone(found);
  });

  // Loop 3: a published listing joins the research corpus straight away.
  await contributeListing(listing);
  return listing;
}

export function validateForPublish(listing: Listing): string[] {
  const problems: string[] = [];
  if (listing.title.trim().length < 12) problems.push("Give the listing a fuller title.");
  if (listing.description.trim().length < 80) {
    problems.push("The description needs at least a couple of sentences.");
  }
  if (listing.images.length < 3) {
    problems.push("Upload at least three photographs — overall, base or reverse, and the marks.");
  }
  if (listing.images.some((i) => !i.quality.accepted)) {
    problems.push("Every photograph must pass the image standard.");
  }
  if (listing.format === "buy" && listing.price <= 0) problems.push("Set a price.");
  if (listing.format === "bid" && listing.startingBid <= 0) problems.push("Set an opening bid.");
  if (!listing.attributes.condition.trim()) {
    problems.push("Describe the condition, including any faults.");
  }
  return problems;
}

/** A blank draft. Everything the composer needs exists from the first keystroke. */
export async function createDraft(sellerId: string, categoryId: string): Promise<Listing> {
  const timestamp = new Date().toISOString();
  const listing: Listing = {
    id: newId("lst"),
    sellerId,
    title: "",
    subtitle: "",
    description: "",
    categoryId,
    format: "buy",
    status: "draft",
    price: 0,
    startingBid: 0,
    reserve: 0,
    currency: "GBP",
    endsAt: null,
    images: [],
    attributes: {
      maker: "", period: "", origin: "", materials: [], marks: "",
      condition: "", conditionGrade: "very-good", provenance: "",
      dimensions: "", signed: false, restored: false,
    },
    seo: { metaTitle: "", metaDescription: "", keywords: [], aiAssistedFields: [] },
    autofilledFrom: null,
    researchSessionId: null,
    shipping: { domestic: 0, international: 0, collectionOnly: false },
    views: 0,
    watchers: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    soldAt: null,
    soldPrice: null,
  };
  await mutate((db) => {
    db.listings.push(listing);
  });
  return listing;
}

/**
 * Apply a partial update from the composer. Only the fields a seller owns are
 * writable — status, views, sale results and the image list are not, so a
 * crafted request cannot publish a listing or mark it sold.
 */
export async function updateListing(
  listingId: string,
  sellerId: string,
  patch: Partial<
    Pick<
      Listing,
      | "title" | "subtitle" | "description" | "categoryId" | "format" | "price"
      | "startingBid" | "reserve" | "currency" | "endsAt" | "attributes" | "seo"
      | "shipping" | "researchSessionId" | "autofilledFrom"
    >
  >,
): Promise<Listing> {
  return mutate((db) => {
    const listing = db.listings.find((l) => l.id === listingId);
    if (!listing) throw new ListingError("Listing not found.", 404);
    if (listing.sellerId !== sellerId) throw new ListingError("That is not your listing.", 403);
    if (listing.status === "sold") throw new ListingError("A sold listing cannot be edited.", 409);

    Object.assign(listing, patch, {
      attributes: { ...listing.attributes, ...(patch.attributes ?? {}) },
      seo: { ...listing.seo, ...(patch.seo ?? {}) },
      shipping: { ...listing.shipping, ...(patch.shipping ?? {}) },
    });
    listing.updatedAt = new Date().toISOString();
    return structuredClone(listing);
  });
}
