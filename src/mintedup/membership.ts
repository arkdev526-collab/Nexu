import type { Tier, Usage, User } from "./types";

/**
 * Membership, and what each tier is allowed to do.
 *
 * Minted Up is invite-only: you apply, a curator approves you, and you arrive
 * on the free tier with a taster allowance of listings. The business runs on
 * the shop subscription, so the free tier is deliberately generous enough to
 * prove the platform works and narrow enough that a working dealer outgrows it
 * inside a month.
 *
 * Every entitlement is read through `entitlements()`. Nothing in the app should
 * branch on `tier` directly — add a field here instead, so pricing and
 * packaging are changed in one file.
 */

export type Entitlements = {
  label: string;
  /** null means unlimited. */
  listingsPerMonth: number | null;
  /** Shop members pay no per-listing fee. */
  listingFeeWaived: boolean;
  aiSeoPerMonth: number | null;
  autocompletePerMonth: number | null;
  /** Concurrent boosted lots. */
  boostSlots: number;
  priorityCuration: boolean;
  verifiedBadge: boolean;
  analytics: boolean;
  shopfrontCustomisation: boolean;
  /** Longest curated sale a member may have a lot in, in days. */
  maxAuctionDays: number;
};

export const ENTITLEMENTS: Record<Tier, Entitlements> = {
  free: {
    label: "Free member",
    listingsPerMonth: 0, // governed by the one-off taster allowance instead
    listingFeeWaived: false,
    aiSeoPerMonth: 10,
    autocompletePerMonth: 3,
    boostSlots: 0,
    priorityCuration: false,
    verifiedBadge: false,
    analytics: false,
    shopfrontCustomisation: false,
    maxAuctionDays: 7,
  },
  shop: {
    label: "Shop member",
    listingsPerMonth: null,
    listingFeeWaived: true,
    aiSeoPerMonth: null,
    autocompletePerMonth: null,
    boostSlots: 3,
    priorityCuration: true,
    verifiedBadge: true,
    analytics: true,
    shopfrontCustomisation: true,
    maxAuctionDays: 21,
  },
};

/** The taster allowance a newly approved member starts with. */
export const FREE_LISTING_ALLOWANCE = 5;

export const SHOP_BENEFITS = [
  "Unlimited listings — the 5p listing fee is waived entirely",
  "Unlimited AI SEO on every field, and unlimited beta auto-complete",
  "Three boosted lots at a time, shown first in the catalogue",
  "Priority curation — your lots go to the front of the queue",
  "A verified shop badge once a curator has passed your first sales",
  "Sales and traffic analytics on your dashboard",
  "A customisable shopfront",
  "Entry to the long-form curated sales, up to 21 days",
];

export function entitlements(user: Pick<User, "membership">): Entitlements {
  // A lapsed or cancelled subscription drops the seller to free-tier limits
  // without touching their listings — they simply stop getting the extras.
  const effective: Tier = user.membership.status === "active" ? user.membership.tier : "free";
  return ENTITLEMENTS[effective];
}

export function isShopMember(user: Pick<User, "membership">): boolean {
  return user.membership.tier === "shop" && user.membership.status === "active";
}

export function currentMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Usage counters roll over on the first of the month rather than on a timer. */
export function rolledUsage(usage: Usage): Usage {
  const month = currentMonth();
  return usage.month === month ? usage : { month, aiSeo: 0, autocomplete: 0 };
}

export type Quota = {
  allowed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  message: string;
};

/** Check a metered feature without consuming it. */
export function checkQuota(user: User, feature: "aiSeo" | "autocomplete"): Quota {
  const limits = entitlements(user);
  const limit = feature === "aiSeo" ? limits.aiSeoPerMonth : limits.autocompletePerMonth;
  const usage = rolledUsage(user.usage);
  const used = usage[feature];

  if (limit === null) {
    return { allowed: true, used, limit: null, remaining: null, message: "" };
  }
  const remaining = Math.max(0, limit - used);
  return {
    allowed: remaining > 0,
    used,
    limit,
    remaining,
    message:
      remaining > 0
        ? `${remaining} of ${limit} left this month on the free tier.`
        : `You have used all ${limit} of this month's free-tier ${
            feature === "aiSeo" ? "AI SEO rewrites" : "auto-complete runs"
          }. Shop members get unlimited use.`,
  };
}

/** Can this seller publish another listing, and what will it cost them? */
export type ListingAllowance = {
  allowed: boolean;
  /** Minor units charged on publish. */
  fee: number;
  reason: string;
  freeRemaining: number;
};

export function listingAllowance(user: User, listingFee: number): ListingAllowance {
  if (isShopMember(user)) {
    return {
      allowed: true,
      fee: 0,
      reason: "Shop member — unlimited listings, no listing fee.",
      freeRemaining: 0,
    };
  }
  if (user.freeListingsRemaining > 0) {
    return {
      allowed: true,
      fee: 0,
      reason: `Free listing ${FREE_LISTING_ALLOWANCE - user.freeListingsRemaining + 1} of ${FREE_LISTING_ALLOWANCE}.`,
      freeRemaining: user.freeListingsRemaining,
    };
  }
  return {
    allowed: true,
    fee: listingFee,
    reason: "Your five free listings are used. This one carries the 5p listing fee.",
    freeRemaining: 0,
  };
}
