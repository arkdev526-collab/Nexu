import { AuthError, createSession, verifyPassword } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { ensureSeeded } from "@/mintedup/seed";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";
import { read } from "@/mintedup/store";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureSeeded();
    const body = await request.json();
    const email = str(body.email).trim().toLowerCase();
    enforceRateLimit(request, "login", { limit: 8, windowMs: 15 * 60_000 }, email);

    const user = await read((db) => db.users.find((u) => u.email === email) ?? null);
    if (!user || !(await verifyPassword(str(body.password), user))) {
      throw new AuthError("Email or password is not right.", 401);
    }
    if (user.suspended) throw new AuthError("This account is suspended.", 403);
    await createSession(user.id);
    return ok({ id: user.id, role: user.role });
  } catch (error) {
    return fail(error);
  }
}
