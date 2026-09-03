import { chargeCommission } from "./billing";
import { recordOutcome } from "./research";
import { mutate, read } from "./store";
import type { Listing, Order } from "./types";

export class OrderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "OrderError";
  }
}

type Confirmed = { order: Order; listing: Listing };
type PaymentQueue = { tail: Promise<unknown> };
const globalPayments = globalThis as typeof globalThis & { __mintedUpPaymentQueue?: PaymentQueue };
const paymentQueue: PaymentQueue = (globalPayments.__mintedUpPaymentQueue ??= { tail: Promise.resolve() });

function serialisePayment<T>(work: () => Promise<T>): Promise<T> {
  const run = paymentQueue.tail.then(work);
  paymentQueue.tail = run.catch(() => undefined);
  return run;
}

/** Confirm a trusted payment event. Safe to retry in the current single-process prototype. */
export async function confirmOrderPayment(input: { orderId: string; paymentReference: string }): Promise<Confirmed> {
  const reference = input.paymentReference.trim();
  if (reference.length < 3 || reference.length > 200) throw new OrderError("A valid payment reference is required.", 400);

  return serialisePayment(async () => {
    const confirmed = await mutate((db) => {
      const order = db.orders.find((candidate) => candidate.id === input.orderId);
      if (!order) throw new OrderError("Order not found.", 404);
      const listing = db.listings.find((candidate) => candidate.id === order.listingId);
      if (!listing) throw new OrderError("The order's listing could not be found.", 409);
      if (order.status === "refunded" || order.paymentStatus === "cancelled") {
        throw new OrderError("A cancelled or refunded order cannot be marked paid.", 409);
      }

      const now = new Date().toISOString();
      if (order.paymentStatus === "awaiting_payment") {
        order.paymentStatus = "confirmed";
        order.paymentReference = reference;
        order.paymentConfirmedAt = now;
        listing.status = "sold";
        listing.reservedOrderId = null;
        listing.soldAt = now;
        listing.soldPrice = order.amount;
        listing.updatedAt = now;
      } else if (!order.paymentStatus) {
        // Legacy rows predate paymentStatus and are treated as already-confirmed sales.
        order.paymentStatus = "confirmed";
        order.paymentReference ??= reference;
        order.paymentConfirmedAt ??= now;
      } else {
        order.paymentReference ??= reference;
        order.paymentConfirmedAt ??= now;
      }

      return { order: structuredClone(order), listing: structuredClone(listing) };
    });

    await chargeCommission({
      sellerId: confirmed.order.sellerId,
      orderId: confirmed.order.id,
      listingId: confirmed.order.listingId,
      amount: confirmed.order.amount,
    });

    const outcomeAlreadyRecorded = await read((db) => {
      const doc = db.researchDocs.find((candidate) => candidate.sourceListingId === confirmed.listing.id);
      return doc?.tier === "market" && doc.realisedPrice === confirmed.order.amount;
    });
    if (!outcomeAlreadyRecorded) await recordOutcome(confirmed.listing, { sold: true, price: confirmed.order.amount });
    return confirmed;
  });
}

export async function cancelAwaitingPayment(orderId: string): Promise<Order> {
  return serialisePayment(() => mutate((db) => {
    const order = db.orders.find((candidate) => candidate.id === orderId);
    if (!order) throw new OrderError("Order not found.", 404);
    if (order.paymentStatus === "cancelled") return structuredClone(order);
    if (order.paymentStatus !== "awaiting_payment") throw new OrderError("Only an unpaid order can be cancelled here.", 409);

    const listing = db.listings.find((candidate) => candidate.id === order.listingId);
    const now = new Date().toISOString();
    order.paymentStatus = "cancelled";
    order.cancelledAt = now;
    if (listing?.reservedOrderId === order.id) {
      listing.reservedOrderId = null;
      if (order.format === "bid") listing.status = "ended";
      listing.updatedAt = now;
    }
    return structuredClone(order);
  }));
}
