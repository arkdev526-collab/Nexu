import { applyForMembership, inspectInvite } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { ensureSeeded } from "@/mintedup/seed";

/** Apply for membership. Minted Up does not take open registrations. */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = await request.json();
    const application = await applyForMembership({
      email: str(body.email),
      name: str(body.name),
      dealing: str(body.dealing),
      links: str(body.links),
    });
    return ok({ id: application.id, status: application.status }, 201);
  } catch (error) {
    return fail(error);
  }
}

/** Check an invitation code before the registration form is filled in. */
export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const code = new URL(request.url).searchParams.get("code") ?? "";
    return ok(await inspectInvite(code));
  } catch (error) {
    return fail(error);
  }
}
