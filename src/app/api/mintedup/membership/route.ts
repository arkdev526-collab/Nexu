import { requireUser } from "@/mintedup/auth";
import { chargeSubscription, PRICING, statementFor } from "@/mintedup/billing";
import { fail, ok, str } from "@/mintedup/http";
import { checkQuota, entitlements, isShopMember } from "@/mintedup/membership";
import { mutate } from "@/mintedup/store";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({
      membership: user.membership,
      entitlements: entitlements(user),
      freeListingsRemaining: user.freeListingsRemaining,
      quotas: {
        aiSeo: checkQuota(user, "aiSeo"),
        autocomplete: checkQuota(user, "autocomplete"),
      },
      statement: await statementFor(user.id),
      pricing: PRICING,
    });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Start or cancel a shop subscription.
 *
 * NOTE: no money moves here. The subscription is recorded on the ledger so the
 * numbers are right when a payment processor is wired in — see
 * docs/mintedup/README.md, which lists that as the first job before launch.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const action = str(body.action, "subscribe");
    const now = new Date();

    if (action === "cancel") {
      await mutate((db) => {
        const record = db.users.find((u) => u.id === user.id);
        if (!record) return;
        // Cancelling runs to the end of the paid period rather than cutting off.
        record.membership.status = "cancelled";
        record.membership.cancelledAt = now.toISOString();
      });
      return ok({ cancelled: true });
    }

    if (isShopMember(user)) {
      return ok({ alreadySubscribed: true, membership: user.membership });
    }

    const renewsAt = new Date(now.getTime() + 30 * 864e5).toISOString();
    const membership = await mutate((db) => {
      const record = db.users.find((u) => u.id === user.id);
      if (!record) throw new Error("User vanished mid-request.");
      record.membership = {
        tier: "shop",
        status: "active",
        since: record.membership.since,
        renewsAt,
        cancelledAt: null,
      };
      return record.membership;
    });
    await chargeSubscription(user.id);

    return ok({ membership, entitlements: entitlements({ membership }) });
  } catch (error) {
    return fail(error);
  }
}
