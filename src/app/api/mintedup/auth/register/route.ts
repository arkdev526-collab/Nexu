import { createSession, registerUser } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { ensureSeeded } from "@/mintedup/seed";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = await request.json();
    const user = await registerUser({
      email: str(body.email),
      password: str(body.password),
      displayName: str(body.displayName),
      shopName: str(body.shopName),
    });
    await createSession(user.id);
    return ok({ id: user.id, role: user.role, shop: user.shop });
  } catch (error) {
    return fail(error);
  }
}
