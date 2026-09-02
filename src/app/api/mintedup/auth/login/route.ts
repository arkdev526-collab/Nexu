import { AuthError, createSession, verifyPassword } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { ensureSeeded } from "@/mintedup/seed";
import { read } from "@/mintedup/store";

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = await request.json();
    const email = str(body.email).trim().toLowerCase();
    const user = await read((db) => db.users.find((u) => u.email === email) ?? null);
    // Same message either way — never confirm which emails are registered.
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
