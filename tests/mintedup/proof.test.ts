import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = path.join(os.tmpdir(), `mintedup-proof-${process.pid}`);
process.env.MINTEDUP_DATA_DIR = dataDir;
await fs.rm(dataDir, { recursive: true, force: true });

const { mutate, read } = await import("../../src/mintedup/store.ts");
const {
  buyNow,
  createDraft,
  currentBid,
  extensionSeconds,
  placeBid,
  settleAuction,
} = await import("../../src/mintedup/listings.ts");
const {
  cancelAwaitingPayment,
  confirmOrderPayment,
  expireAwaitingPayments,
  PAYMENT_WINDOW_MS,
} = await import("../../src/mintedup/orders.ts");

async function reset(): Promise<void> {
  await mutate((db) => {
    db.users = [];
    db.listings = [];
    db.bids = [];
    db.orders = [];
    db.sessions = [];
    db.researchSessions = [];
    db.researchDocs = [];
    db.learningEvents = [];
    db.applications = [];
    db.invites = [];
    db.ledger = [];
    db.auctions = [];
  });
}

async function activeListing(format: "buy" | "bid", reserve = 0) {
  const draft = await createDraft("seller", "ceramics");
  await mutate((db) => {
    const listing = db.listings.find((candidate) => candidate.id === draft.id)!;
    listing.status = "active";
    listing.format = format;
    listing.title = "Proof layer antique test lot";
    listing.description = "A sufficiently detailed factual description for the Minted Up proof-layer regression fixture.";
    listing.attributes.condition = "Good test condition.";
    listing.price = 10_000;
    listing.startingBid = 1_000;
    listing.reserve = reserve;
    listing.endsAt = format === "bid" ? new Date(Date.now() + 60_000).toISOString() : null;
  });
  return draft.id;
}

test("proxy ties preserve the earlier bidder and do not reveal more than the tied ceiling", async () => {
  await reset();
  const listingId = await activeListing("bid");
  await placeBid({ listingId, bidderId: "first", maxAmount: 10_000 });
  const tied = await placeBid({ listingId, bidderId: "second", maxAmount: 10_000 });
  assert.equal(tied.leading, false);
  assert.equal(tied.visibleAmount, 10_000);
  const standing = await read((db) => currentBid(db.listings.find((l) => l.id === listingId)!, db.bids));
  assert.equal(standing.bidderId, "first");
});

test("a proxy authorised through reserve advances the visible bid to reserve", async () => {
  await reset();
  const listingId = await activeListing("bid", 5_000);
  const result = await placeBid({ listingId, bidderId: "bidder", maxAmount: 6_000 });
  assert.equal(result.visibleAmount, 5_000);
});

test("anti-sniping extensions count down to a one-second floor", () => {
  assert.equal(extensionSeconds(0), 10);
  assert.equal(extensionSeconds(8), 2);
  assert.equal(extensionSeconds(9), 1);
  assert.equal(extensionSeconds(50), 1);
});

test("an auction with no qualifying winner records one no-sale outcome", async () => {
  await reset();
  const listingId = await activeListing("bid", 5_000);
  await mutate((db) => {
    db.listings.find((listing) => listing.id === listingId)!.endsAt = new Date(Date.now() - 1_000).toISOString();
  });
  assert.equal(await settleAuction(listingId), null);
  const state = await read((db) => ({
    status: db.listings.find((listing) => listing.id === listingId)!.status,
    noSales: db.learningEvents.filter((event) => event.kind === "no_sale_outcome").length,
  }));
  assert.equal(state.status, "ended");
  assert.equal(state.noSales, 1);
});

test("payment confirmation is idempotent and conflicting references are rejected", async () => {
  await reset();
  const listingId = await activeListing("buy");
  const order = await buyNow({ listingId, buyerId: "buyer" });
  assert.equal(order.paymentStatus, "awaiting_payment");
  assert.ok(order.paymentExpiresAt);
  assert.ok(Date.parse(order.paymentExpiresAt!) - Date.parse(order.placedAt) <= PAYMENT_WINDOW_MS.buy + 1_000);

  await confirmOrderPayment({ orderId: order.id, paymentReference: "pay-proof-1" });
  await confirmOrderPayment({ orderId: order.id, paymentReference: "pay-proof-1" });
  await assert.rejects(
    confirmOrderPayment({ orderId: order.id, paymentReference: "pay-different" }),
    (error: unknown) => (error as { status?: number }).status === 409,
  );

  const state = await read((db) => ({
    commissions: db.ledger.filter((entry) => entry.kind === "commission" && entry.orderId === order.id).length,
    marketDocs: db.researchDocs.filter((doc) => doc.sourceListingId === listingId && doc.tier === "market").length,
    saleEvents: db.learningEvents.filter((event) => event.kind === "sale_outcome").length,
    listing: db.listings.find((candidate) => candidate.id === listingId)!,
  }));
  assert.equal(state.commissions, 1);
  assert.equal(state.marketDocs, 1);
  assert.equal(state.saleEvents, 1);
  assert.equal(state.listing.status, "sold");
  assert.equal(state.listing.reservedOrderId, null);
});

test("manual cancellation releases fixed-price stock and cannot later be confirmed", async () => {
  await reset();
  const listingId = await activeListing("buy");
  const order = await buyNow({ listingId, buyerId: "buyer" });
  await cancelAwaitingPayment(order.id);
  await assert.rejects(
    confirmOrderPayment({ orderId: order.id, paymentReference: "pay-after-cancel" }),
    (error: unknown) => (error as { status?: number }).status === 409,
  );
  const state = await read((db) => ({
    order: db.orders.find((candidate) => candidate.id === order.id)!,
    listing: db.listings.find((candidate) => candidate.id === listingId)!,
  }));
  assert.equal(state.order.paymentStatus, "cancelled");
  assert.equal(state.listing.status, "active");
  assert.equal(state.listing.reservedOrderId, null);
});

test("expired reservations release Buy It stock but close an auction winner without market learning", async () => {
  await reset();
  const buyListingId = await activeListing("buy");
  const buyOrder = await buyNow({ listingId: buyListingId, buyerId: "buyer" });
  await mutate((db) => {
    db.orders.find((order) => order.id === buyOrder.id)!.paymentExpiresAt = new Date(Date.now() - 1_000).toISOString();
  });
  assert.deepEqual(await expireAwaitingPayments(), [buyOrder.id]);

  const auctionListingId = await activeListing("bid");
  await placeBid({ listingId: auctionListingId, bidderId: "winner", maxAmount: 4_000 });
  await mutate((db) => {
    db.listings.find((listing) => listing.id === auctionListingId)!.endsAt = new Date(Date.now() - 1_000).toISOString();
  });
  const auctionOrder = await settleAuction(auctionListingId);
  assert.ok(auctionOrder);
  await mutate((db) => {
    db.orders.find((order) => order.id === auctionOrder!.id)!.paymentExpiresAt = new Date(Date.now() - 1_000).toISOString();
  });
  assert.deepEqual(await expireAwaitingPayments(), [auctionOrder!.id]);

  const state = await read((db) => ({
    buy: db.listings.find((listing) => listing.id === buyListingId)!,
    auction: db.listings.find((listing) => listing.id === auctionListingId)!,
    commissions: db.ledger.filter((entry) => entry.kind === "commission").length,
    saleEvents: db.learningEvents.filter((event) => event.kind === "sale_outcome").length,
  }));
  assert.equal(state.buy.status, "active");
  assert.equal(state.buy.reservedOrderId, null);
  assert.equal(state.auction.status, "ended");
  assert.equal(state.auction.reservedOrderId, null);
  assert.equal(state.commissions, 0);
  assert.equal(state.saleEvents, 0);
});

test.after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
