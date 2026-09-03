import { destroySession } from "@/mintedup/auth";
import { fail, ok } from "@/mintedup/http";

export async function POST() {
  try {
    await destroySession();
    return ok({ signedOut: true });
  } catch (error) {
    return fail(error);
  }
}
