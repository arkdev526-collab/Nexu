import { applyForMembership, inspectInvite } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { ensureSeeded } from "@/mintedup/seed";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureSeeded();
    const body = await request.json();
    const email = str(body.email).trim().toLowerCase();
    enforceRateLimit(request, "application", { limit: 4, windowMs: 60 * 60_000 }, email);

    const application = await applyForMembership({
      email,
      name: str(body.name),
      dealing: str(body.dealing),
      links: str(body.links),
    });
    return ok({ id: application.id, status: application.status }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: Request) {
  try {
    await ensureSeeded();
    enforceRateLimit(request, "invite-inspect", { limit: 30, windowMs: 10 * 60_000 });
    const code = new URL(request.url).searchParams.get("code") ?? "";
    return ok(await inspectInvite(code));
  } catch (error) {
    return fail(error);
  }
}
