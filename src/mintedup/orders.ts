import { chargeCommission } from "./billing";
import { recordOutcome } from "./research";
import { mutate, read } from "./store";
import type { Listing, Order } from "./types";

/**
 * Order/payment boundary.
 *
 * Listing mechanics may create an `awaiting_payment` order and reserve a lot,
 * but only this module may turn that reservation into a realised sale. That
 * keeps the research corpus, commission ledger and seller reporting tied to a
 * confirmed payment event instead of a button click.
 */

export class OrderError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

type Confirmed = {
  order: Order;
  listing: Listing;
};

type PaymentQueue = { tail: Promise<unknown> };
const globalPayments = globalThis as typeof globalThis & {
  __mintedUpPaymentQueue?: PaymentQueue;
};
const paymentQueue: PaymentQueue = (globalPayments.__mintedUpPaymentQueue ??= {
  tail: Promise.resolve(),
});

/**
 * Serialise the complete payment-finalisation path in the current single-process
 * prototype. `store.mutate()` already serialises each individual write, but the
 * business operation spans the order transition, commission posting and market
 * learning. Keeping those steps behind one queue closes the retry race where two
 * provider callbacks could both observe that the research outcome was missing.
 *
 * A production multi-instance deployment still requires a transactional database
 * plus a provider event/idempotency key; this process queue is deliberately not a
 * substitute for that.
 */
function serialisePayment<T>(work: () => Promise<T>): Promise<T> {
  const run = paymentQueue.tail.then(work);
  paymentQueue.tail = run.catch(() => undefined);
  return run;
}

/**
 * Confirm payment using a processor/reference supplied by the trusted payment
 * layer. Safe to retry inside the current single-process store: the order
 * transition is idempotent, commission is deduplicated by order id and the
 * market outcome is checked while the full finalisation path is serialised.
 */
export async function confirmOrderPayment(input: {
  orderId: string;
  paymentReference: string;
}): Promise<Confirmed> {
  const reference = input.paymentReference.trim();
  if (reference.length < 3 || reference.length > 200) {
    throw new OrderError("A valid payment reference is required.", 400);
  }

  return serialisePayment(async () => {
    const confirmed = await mutate((db) => {
      const order = db.orders.find((candidate) => candidate.id === input.orderId);
      if (!order) throw new OrderError("Order not found.", 404);
      const listing = db.listings.find((candidate) => candidate.id === order.listingId);
      if (!listing) throw new OrderError("The order's listing could not be found.", 409);

      if (order.status === "cancelled" || order.status === "refunded") {
        throw new OrderError("A cancelled or refunded order cannot be marked paid.", 409);
      }

      if (order.status === "awaiting_payment") {
        const now = new Date().toISOString();
        order.status = "paid";
        order.paymentReference = reference;
        order.paymentConfirmedAt = now;
        listing.status = "sold";
        listing.soldAt = now;
        listing.soldPrice = order.amount;
        listing.updatedAt = now;
      } else if (!order.paymentReference) {
        // Backwards-compatible repair for an older paid row that predates the
        // explicit payment fields.
        order.paymentReference = reference;
        order.paymentConfirmedAt ??= new Date().toISOString();
      }

      return {
        order: structuredClone(order),
        listing: structuredClone(listing),
      };
    });

    await chargeCommission({
      sellerId: confirmed.order.sellerId,
      orderId: confirmed.order.id,
      listingId: confirmed.order.listingId,
      amount: confirmed.order.amount,
    });

    const outcomeAlreadyRecorded = await read((db) => {
      const doc = db.researchDocs.find(
        (candidate) => candidate.sourceListingId === confirmed.listing.id,
      );
      return doc?.tier === "market" && doc.realisedPrice === confirmed.order.amount;
    });
    if (!outcomeAlreadyRecorded) {
      await recordOutcome(confirmed.listing, { sold: true, price: confirmed.order.amount });
    }

    return confirmed;
  });
}

/**
 * Cancel an unpaid reservation. Fixed-price stock returns to the catalogue;
 * an auction remains ended because its bidding window has already closed.
 */
export async function cancelAwaitingPayment(orderId: string): Promise<Order> {
  return serialisePayment(() =>
    mutate((db) => {
      const order = db.orders.find((candidate) => candidate.id === orderId);
      if (!order) throw new OrderError("Order not found.", 404);
      if (order.status === "cancelled") return structuredClone(order);
      if (order.status !== "awaiting_payment") {
        throw new OrderError("Only an unpaid order can be cancelled here.", 409);
      }

      const listing = db.listings.find((candidate) => candidate.id === order.listingId);
      const now = new Date().toISOString();
      order.status = "cancelled";
      order.cancelledAt = now;

      if (listing?.status === "reserved") {
        listing.status = order.format === "buy" ? "active" : "ended";
        listing.updatedAt = now;
      }

      return structuredClone(order);
    }),
  );
}
