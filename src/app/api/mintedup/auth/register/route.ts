import { createSession, registerUser } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { ensureSeeded } from "@/mintedup/seed";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureSeeded();
    const body = await request.json();
    const email = str(body.email).trim().toLowerCase();
    enforceRateLimit(request, "register", { limit: 5, windowMs: 60 * 60_000 }, email);

    const user = await registerUser({
      email,
      password: str(body.password),
      displayName: str(body.displayName),
      shopName: str(body.shopName),
      inviteCode: str(body.inviteCode),
    });
    await createSession(user.id);
    return ok({ id: user.id, role: user.role, shop: user.shop, membership: user.membership });
  } catch (error) {
    return fail(error);
  }
}
