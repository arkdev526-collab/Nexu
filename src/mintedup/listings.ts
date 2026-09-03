import { formatMoney } from "./format";
import { expireAwaitingPayments, paymentWindowMs } from "./orders";
import { recordOutcome } from "./research";
import { mutate, newId, read } from "./store";
import type { Bid, Listing, Order } from "./types";

export class ListingError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ListingError";
  }
}

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
  return { amount: top ? top.amount : listing.startingBid, bidderId: top ? top.bidderId : null, count: live.length };
}

export function minimumBid(listing: Listing, bids: Bid[]): number {
  const { amount, count } = currentBid(listing, bids);
  return count === 0 ? listing.startingBid : amount + bidIncrement(amount);
}

export function isLive(listing: Listing): boolean {
  if (listing.status !== "active" || listing.reservedOrderId) return false;
  if (listing.format === "bid" && listing.endsAt) return Date.parse(listing.endsAt) > Date.now();
  return true;
}

export const FIRST_EXTENSION_SECONDS = 10;
export const MIN_EXTENSION_SECONDS = 1;
export function extensionSeconds(previousExtensions: number): number {
  return Math.max(MIN_EXTENSION_SECONDS, FIRST_EXTENSION_SECONDS - previousExtensions);
}

export async function placeBid(input: { listingId: string; bidderId: string; maxAmount: number }): Promise<{ bid: Bid; visibleAmount: number; leading: boolean; secondsAdded: number; endsAt: string | null; nextExtensionSeconds: number }> {
  await expireAwaitingPayments();
  return mutate((db) => {
    const listing = db.listings.find((l) => l.id === input.listingId);
    if (!listing) throw new ListingError("Listing not found.", 404);
    if (listing.format !== "bid") throw new ListingError("This listing is not an auction.");
    if (!isLive(listing)) throw new ListingError("Bidding on this lot has closed.");
    const auction = listing.auctionId ? db.auctions.find((a) => a.id === listing.auctionId) : null;
    if (auction && Date.now() < Date.parse(auction.opensAt)) throw new ListingError(`${auction.title} has not opened yet.`, 409);
    if (listing.sellerId === input.bidderId) throw new ListingError("You cannot bid on your own lot.");

    const live = db.bids.filter((b) => b.listingId === listing.id && !b.retracted);
    const standingVisible = live.length ? Math.max(...live.map((b) => b.amount)) : 0;
    const floor = live.length === 0 ? listing.startingBid : standingVisible + bidIncrement(standingVisible);
    if (input.maxAmount < floor) throw new ListingError(`The next valid bid is ${formatMoney(floor, listing.currency)}.`);

    const standingMax = live.length ? Math.max(...live.map((b) => b.maxAmount)) : 0;
    const standingLeader = live.find((b) => b.maxAmount === standingMax) ?? null;
    const bidderLeads = input.maxAmount > standingMax;
    let visibleAmount = bidderLeads
      ? Math.min(input.maxAmount, Math.max(floor, standingMax + bidIncrement(standingMax)))
      : Math.min(standingMax, input.maxAmount + bidIncrement(input.maxAmount));

    const leadingMax = Math.max(input.maxAmount, standingMax);
    if (listing.reserve > 0 && leadingMax >= listing.reserve && visibleAmount < listing.reserve) visibleAmount = listing.reserve;

    const bid: Bid = {
      id: newId("bid"), listingId: listing.id, bidderId: input.bidderId,
      amount: bidderLeads ? visibleAmount : input.maxAmount, maxAmount: input.maxAmount,
      placedAt: new Date().toISOString(), retracted: false,
    };
    db.bids.push(bid);

    if (!bidderLeads && standingLeader) {
      db.bids.push({
        id: newId("bid"), listingId: listing.id, bidderId: standingLeader.bidderId,
        amount: visibleAmount, maxAmount: standingMax, placedAt: new Date().toISOString(), retracted: false,
      });
    }

    const added = extensionSeconds(listing.extensions);
    if (listing.endsAt) listing.endsAt = new Date(Date.parse(listing.endsAt) + added * 1000).toISOString();
    listing.extensions += 1;
    listing.updatedAt = new Date().toISOString();
    return { bid, visibleAmount, leading: bidderLeads, secondsAdded: added, endsAt: listing.endsAt, nextExtensionSeconds: extensionSeconds(listing.extensions) };
  });
}

/** Reserve a fixed-price lot without recording a realised sale. */
export async function buyNow(input: { listingId: string; buyerId: string }): Promise<Order> {
  await expireAwaitingPayments();
  return mutate((db) => {
    const listing = db.listings.find((l) => l.id === input.listingId);
    if (!listing) throw new ListingError("Listing not found.", 404);
    if (listing.format !== "buy") throw new ListingError("This lot is sold by auction.");
    if (!isLive(listing)) throw new ListingError("This listing is no longer available.");
    if (listing.sellerId === input.buyerId) throw new ListingError("You cannot buy your own listing.");

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const order: Order = {
      id: newId("ord"), listingId: listing.id, buyerId: input.buyerId, sellerId: listing.sellerId,
      amount: listing.price, format: "buy", placedAt: now,
      status: "paid", paymentStatus: "awaiting_payment", paymentReference: null,
      paymentConfirmedAt: null, paymentExpiresAt: new Date(nowMs + paymentWindowMs("buy")).toISOString(),
      cancelledAt: null,
    };
    db.orders.push(order);
    listing.reservedOrderId = order.id;
    listing.updatedAt = now;
    return structuredClone(order);
  });
}

export async function settleAuction(listingId: string): Promise<Order | null> {
  const outcome = await mutate((db) => {
    const listing = db.listings.find((l) => l.id === listingId);
    if (!listing || listing.format !== "bid" || listing.status !== "active" || listing.reservedOrderId) return null;
    if (listing.endsAt && Date.parse(listing.endsAt) > Date.now()) return null;

    const live = db.bids.filter((b) => b.listingId === listing.id && !b.retracted);
    const top = live.sort((a, b) => a.amount - b.amount).at(-1);
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    if (!top || top.amount < listing.reserve) {
      listing.status = "ended";
      listing.updatedAt = now;
      return { order: null, listing: structuredClone(listing), noSale: true };
    }

    const order: Order = {
      id: newId("ord"), listingId: listing.id, buyerId: top.bidderId, sellerId: listing.sellerId,
      amount: top.amount, format: "bid", placedAt: now,
      status: "paid", paymentStatus: "awaiting_payment", paymentReference: null,
      paymentConfirmedAt: null, paymentExpiresAt: new Date(nowMs + paymentWindowMs("bid")).toISOString(),
      cancelledAt: null,
    };
    db.orders.push(order);
    listing.reservedOrderId = order.id;
    listing.updatedAt = now;
    return { order: structuredClone(order), listing: structuredClone(listing), noSale: false };
  });

  if (!outcome) return null;
  if (outcome.noSale) await recordOutcome(outcome.listing, { sold: false, price: null });
  return outcome.order;
}

export async function settleDueAuctions(): Promise<void> {
  await expireAwaitingPayments();
  const due = await read((db) => db.listings
    .filter((l) => l.format === "bid" && l.status === "active" && !l.reservedOrderId && l.endsAt !== null && Date.parse(l.endsAt) <= Date.now())
    .map((l) => l.id));
  for (const id of due) await settleAuction(id);
}

export function validateForSubmission(listing: Listing): string[] {
  const problems: string[] = [];
  if (listing.title.trim().length < 12) problems.push("Give the listing a fuller title.");
  if (listing.description.trim().length < 80) problems.push("The description needs at least a couple of sentences.");
  if (listing.images.length < 3) problems.push("Upload at least three photographs — overall, base or reverse, and the marks.");
  if (listing.images.some((i) => !i.quality.accepted)) problems.push("Every photograph must pass the image standard.");
  if (listing.format === "buy" && listing.price <= 0) problems.push("Set a price.");
  if (listing.format === "bid" && listing.startingBid <= 0) problems.push("Set an opening bid.");
  if (!listing.attributes.condition.trim()) problems.push("Describe the condition, including any faults.");
  return problems;
}

export async function createDraft(sellerId: string, categoryId: string): Promise<Listing> {
  const timestamp = new Date().toISOString();
  const listing: Listing = {
    id: newId("lst"), sellerId, title: "", subtitle: "", description: "", categoryId,
    format: "buy", status: "draft", price: 0, startingBid: 0, reserve: 0, currency: "GBP", endsAt: null, images: [],
    attributes: { maker: "", period: "", origin: "", materials: [], marks: "", condition: "", conditionGrade: "very-good", provenance: "", dimensions: "", signed: false, restored: false },
    seo: { metaTitle: "", metaDescription: "", keywords: [], aiAssistedFields: [] }, autofilledFrom: null, researchSessionId: null,
    curation: { curatorId: null, decidedAt: null, notes: "", changesRequested: [], submittedAt: null, priority: false },
    auctionId: null, boostedAt: null, extensions: 0, reservedOrderId: null,
    shipping: { domestic: 0, international: 0, collectionOnly: false }, views: 0, watchers: [],
    createdAt: timestamp, updatedAt: timestamp, soldAt: null, soldPrice: null,
  };
  await mutate((db) => { db.listings.push(listing); });
  return listing;
}

export async function updateListing(
  listingId: string,
  sellerId: string,
  patch: Partial<Pick<Listing, "title" | "subtitle" | "description" | "categoryId" | "format" | "price" | "startingBid" | "reserve" | "currency" | "endsAt" | "attributes" | "seo" | "shipping" | "researchSessionId" | "autofilledFrom">>,
): Promise<Listing> {
  return mutate((db) => {
    const listing = db.listings.find((l) => l.id === listingId);
    if (!listing) throw new ListingError("Listing not found.", 404);
    if (listing.sellerId !== sellerId) throw new ListingError("That is not your listing.", 403);
    if (!["draft", "changes", "rejected"].includes(listing.status)) throw new ListingError("This lot is locked while it is in curation or commerce.", 409);
    Object.assign(listing, patch, {
      attributes: { ...listing.attributes, ...(patch.attributes ?? {}) },
      seo: { ...listing.seo, ...(patch.seo ?? {}) },
      shipping: { ...listing.shipping, ...(patch.shipping ?? {}) },
    });
    listing.updatedAt = new Date().toISOString();
    return structuredClone(listing);
  });
}
