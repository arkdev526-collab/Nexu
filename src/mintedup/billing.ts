import { entitlements, listingAllowance } from "./membership";
import { mutate, newId, read } from "./store";
import type { LedgerEntry, User } from "./types";

/**
 * Fees and the ledger.
 *
 * IMPORTANT: nothing in this file moves money. Every function records what is
 * owed so the arithmetic is right and auditable the day a payment processor is
 * wired in — `docs/mintedup/README.md` lists that as the first job before
 * launch. Charging is deliberately concentrated here rather than sprinkled
 * through the listing and order code.
 */

export const PRICING = {
  /** Per published listing, in minor units. Waived for shop members. */
  listingFee: 5,
  /** Taken from the hammer price or buy-it-now price on every sale. */
  commissionRate: 0.01,
  /** Shop subscription, per month, in minor units. */
  subscription: 2000,
  currency: "GBP" as const,
};

export function describePricing(): string[] {
  return [
    `${PRICING.listingFee}p per listing, waived entirely for shop members.`,
    `${(PRICING.commissionRate * 100).toFixed(0)}% of the total sale value, on every sale.`,
    `£${(PRICING.subscription / 100).toFixed(0)} a month for a shop, cancel any time.`,
  ];
}

export function commissionOn(amount: number): number {
  // Round half up to the penny; a fee of zero on a real sale looks like a bug
  // to a seller reading their statement, so the floor is 1p.
  return Math.max(1, Math.round(amount * PRICING.commissionRate));
}

async function post(entry: Omit<LedgerEntry, "id" | "createdAt" | "currency">): Promise<LedgerEntry> {
  const row: LedgerEntry = {
    ...entry,
    id: newId("led"),
    currency: PRICING.currency,
    createdAt: new Date().toISOString(),
  };
  await mutate((db) => {
    db.ledger.push(row);
  });
  return row;
}

/**
 * Charge for publishing. Consumes a free-tier taster listing where one is left,
 * and records a zero-value entry when it does so the seller can see the
 * allowance being spent rather than wondering where it went.
 */
export async function chargeListingFee(user: User, listingId: string): Promise<LedgerEntry> {
  const allowance = listingAllowance(user, PRICING.listingFee);

  if (allowance.fee === 0 && !entitlements(user).listingFeeWaived) {
    await mutate((db) => {
      const record = db.users.find((u) => u.id === user.id);
      if (record && record.freeListingsRemaining > 0) record.freeListingsRemaining -= 1;
    });
  }

  return post({
    userId: user.id,
    kind: "listing_fee",
    amount: allowance.fee,
    description: allowance.reason,
    listingId,
    orderId: null,
  });
}

export async function chargeCommission(input: {
  sellerId: string;
  orderId: string;
  listingId: string;
  amount: number;
}): Promise<LedgerEntry> {
  const fee = commissionOn(input.amount);
  return post({
    userId: input.sellerId,
    kind: "commission",
    amount: fee,
    description: `${(PRICING.commissionRate * 100).toFixed(0)}% commission on a sale of £${(input.amount / 100).toFixed(2)}.`,
    listingId: input.listingId,
    orderId: input.orderId,
  });
}

export async function chargeSubscription(userId: string, months = 1): Promise<LedgerEntry> {
  return post({
    userId,
    kind: "subscription",
    amount: PRICING.subscription * months,
    description: `Shop membership, ${months} month${months === 1 ? "" : "s"}.`,
    listingId: null,
    orderId: null,
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

/** Platform-wide revenue, for the admin backend. */
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
