import { AuthError } from "./auth";
import { checkQuota, rolledUsage, type Quota } from "./membership";
import { mutate } from "./store";
import type { User } from "./types";

/**
 * Consume one unit of a metered feature, or refuse.
 *
 * The AI endpoints cost real money per call, so the free tier is capped and the
 * shop tier is not. Kept out of membership.ts because that module is pure —
 * this one writes.
 */
export async function consumeQuota(
  user: User,
  feature: "aiSeo" | "autocomplete",
): Promise<Quota> {
  const quota = checkQuota(user, feature);
  if (!quota.allowed) {
    // 402 so the client can offer the upgrade rather than showing an error.
    throw new AuthError(quota.message, 402);
  }
  if (quota.limit === null) return quota;

  await mutate((db) => {
    const record = db.users.find((u) => u.id === user.id);
    if (!record) return;
    const usage = rolledUsage(record.usage);
    usage[feature] += 1;
    record.usage = usage;
  });

  return {
    ...quota,
    used: quota.used + 1,
    remaining: quota.remaining === null ? null : Math.max(0, quota.remaining - 1),
  };
}
