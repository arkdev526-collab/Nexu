import { entitlements, listingAllowance } from "./membership";
import { mutate, newId, read } from "./store";
import type { LedgerEntry, User } from "./types";

/**
 * Fees and the ledger.
 *
 * IMPORTANT: nothing in this file moves money. Every function records what is
 * owed so the arithmetic is right and auditable the day a payment processor is
 * wired in. Entries that are tied to one business event are idempotent: retrying
 * a curation approval or payment callback must not charge twice.
 */

export const PRICING = {
  /** Per published listing, in minor units. Waived for shop members. */
  listingFee: 5,
  /** Taken from the hammer price or buy-it-now price on every confirmed sale. */
  commissionRate: 0.01,
  /** Shop subscription, per month, in minor units. */
  subscription: 2000,
  currency: "GBP" as const,
};

export function describePricing(): string[] {
  return [
    `${PRICING.listingFee}p per listing, waived entirely for shop members.`,
    `${(PRICING.commissionRate * 100).toFixed(0)}% of the total sale value, on every confirmed sale.`,
    `£${(PRICING.subscription / 100).toFixed(0)} a month for a shop, cancel any time.`,
  ];
}

export function commissionOn(amount: number): number {
  // Round half up to the penny; a fee of zero on a real sale looks like a bug
  // to a seller reading their statement, so the floor is 1p.
  return Math.max(1, Math.round(amount * PRICING.commissionRate));
}

function ledgerRow(
  entry: Omit<LedgerEntry, "id" | "createdAt" | "currency">,
): LedgerEntry {
  return {
    ...entry,
    id: newId("led"),
    currency: PRICING.currency,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Charge for publishing. The allowance decrement and ledger write are one
 * serialised mutation so a crash/retry cannot spend the allowance without the
 * matching statement row, or vice versa.
 */
export async function chargeListingFee(user: User, listingId: string): Promise<LedgerEntry> {
  return mutate((db) => {
    const existing = db.ledger.find(
      (entry) => entry.kind === "listing_fee" && entry.listingId === listingId,
    );
    if (existing) return structuredClone(existing);

    const record = db.users.find((candidate) => candidate.id === user.id) ?? user;
    const allowance = listingAllowance(record, PRICING.listingFee);

    if (allowance.fee === 0 && !entitlements(record).listingFeeWaived) {
      const stored = db.users.find((candidate) => candidate.id === user.id);
      if (stored && stored.freeListingsRemaining > 0) stored.freeListingsRemaining -= 1;
    }

    const row = ledgerRow({
      userId: user.id,
      kind: "listing_fee",
      amount: allowance.fee,
      description: allowance.reason,
      listingId,
      orderId: null,
    });
    db.ledger.push(row);
    return structuredClone(row);
  });
}

/** One commission row per order, even if a provider webhook is retried. */
export async function chargeCommission(input: {
  sellerId: string;
  orderId: string;
  listingId: string;
  amount: number;
}): Promise<LedgerEntry> {
  return mutate((db) => {
    const existing = db.ledger.find(
      (entry) => entry.kind === "commission" && entry.orderId === input.orderId,
    );
    if (existing) return structuredClone(existing);

    const fee = commissionOn(input.amount);
    const row = ledgerRow({
      userId: input.sellerId,
      kind: "commission",
      amount: fee,
      description: `${(PRICING.commissionRate * 100).toFixed(0)}% commission on a confirmed sale of £${(input.amount / 100).toFixed(2)}.`,
      listingId: input.listingId,
      orderId: input.orderId,
    });
    db.ledger.push(row);
    return structuredClone(row);
  });
}

export async function chargeSubscription(userId: string, months = 1): Promise<LedgerEntry> {
  return mutate((db) => {
    const row = ledgerRow({
      userId,
      kind: "subscription",
      amount: PRICING.subscription * months,
      description: `Shop membership, ${months} month${months === 1 ? "" : "s"}.`,
      listingId: null,
      orderId: null,
    });
    db.ledger.push(row);
    return structuredClone(row);
  });
}

export type Statement = {
  entries: LedgerEntry[];
  listingFees: number;
  commission: number;
  subscription: number;
  credits: number;
  total: number;
};

export async function statementFor(userId: string): Promise<Statement> {
  const entries = await read((db) =>
    db.ledger
      .filter((e) => e.userId === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
  );
  const sum = (kind: LedgerEntry["kind"]) =>
    entries.filter((e) => e.kind === kind).reduce((total, e) => total + e.amount, 0);

  return {
    entries,
    listingFees: sum("listing_fee"),
    commission: sum("commission"),
    subscription: sum("subscription"),
    credits: sum("credit"),
    total: entries.reduce((total, e) => total + e.amount, 0),
  };
}

/** Platform-wide accrued revenue, for the admin backend. */
export async function revenueSummary(): Promise<{
  listingFees: number;
  commission: number;
  subscription: number;
  total: number;
  shopMembers: number;
  freeMembers: number;
  monthlyRecurring: number;
}> {
  return read((db) => {
    const sum = (kind: LedgerEntry["kind"]) =>
      db.ledger.filter((e) => e.kind === kind).reduce((total, e) => total + e.amount, 0);
    const shopMembers = db.users.filter(
      (u) => u.membership.tier === "shop" && u.membership.status === "active",
    ).length;
    return {
      listingFees: sum("listing_fee"),
      commission: sum("commission"),
      subscription: sum("subscription"),
      total: db.ledger.reduce((total, e) => total + e.amount, 0),
      shopMembers,
      freeMembers: db.users.filter((u) => u.membership.tier === "free").length,
      monthlyRecurring: shopMembers * PRICING.subscription,
    };
  });
}
