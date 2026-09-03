import { requireRole } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { cancelAwaitingPayment, confirmOrderPayment, OrderError } from "@/mintedup/orders";

/**
 * Development/manual payment bridge.
 *
 * This is intentionally admin-only and disabled in production unless the
 * operator explicitly opts in. A real payment provider should call the domain
 * functions from its authenticated webhook instead of exposing a public
 * "mark paid" control.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
    if (
      process.env.NODE_ENV === "production" &&
      process.env.MINTEDUP_ALLOW_MANUAL_PAYMENT !== "1"
    ) {
      throw new OrderError("Manual payment confirmation is disabled in production.", 403);
    }

    const { id } = await params;
    const body = await request.json();
    const action = str(body.action);

    if (action === "confirm") {
      const paymentReference = str(body.paymentReference);
      const confirmed = await confirmOrderPayment({ orderId: id, paymentReference });
      return ok(confirmed);
    }
    if (action === "cancel") {
      const order = await cancelAwaitingPayment(id);
      return ok({ order });
    }

    throw new OrderError("Action must be 'confirm' or 'cancel'.", 400);
  } catch (error) {
    return fail(error);
  }
}
