import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { currentMonth, FREE_LISTING_ALLOWANCE } from "./membership";
import { mutate, newId, read } from "./store";
import type { Application, Invite, Role, Session, User } from "./types";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = "mintedup_session";
const SESSION_DAYS = 30;

export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
): Promise<{ hash: string; salt: string }> {
  const derived = await scryptAsync(password, salt, 64);
  return { hash: derived.toString("hex"), salt };
}

export async function verifyPassword(password: string, user: User): Promise<boolean> {
  const derived = await scryptAsync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  // Lengths differ only if the stored hash is corrupt; timingSafeEqual throws on mismatch.
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
}

export async function createSession(userId: string): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    token: randomBytes(32).toString("hex"),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_DAYS * 864e5).toISOString(),
  };
  await mutate((db) => {
    // Opportunistically sweep expired rows so the table cannot grow forever.
    db.sessions = db.sessions.filter((s) => Date.parse(s.expiresAt) > now);
    db.sessions.push(session);
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return session;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await mutate((db) => {
      db.sessions = db.sessions.filter((s) => s.token !== token);
    });
  }
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Safe to call from pages and route handlers. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return read((db) => {
    const session = db.sessions.find((s) => s.token === token);
    if (!session || Date.parse(session.expiresAt) < Date.now()) return null;
    const user = db.users.find((u) => u.id === session.userId);
    if (!user || user.suspended) return null;
    return user;
  });
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new AuthError("You need to be signed in to do that.", 401);
  return user;
}

/** Curators can work the queue; admins can do everything a curator can. */
export async function requireRole(role: Role): Promise<User> {
  const user = await requireUser();
  const rank: Record<Role, number> = { user: 0, curator: 1, admin: 2 };
  if (rank[user.role] < rank[role]) {
    throw new AuthError(
      role === "admin" ? "Administrator access required." : "Curator access required.",
      403,
    );
  }
  return user;
}

export function canCurate(user: Pick<User, "role">): boolean {
  return user.role === "curator" || user.role === "admin";
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Minted Up does not take open registrations.
 *
 * You apply, a curator reads the application, and approval issues a single-use
 * invitation code bound to your email address. Registration consumes it. That
 * is the whole gate — there is no path into the marketplace that skips it.
 */
export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
  shopName: string;
  inviteCode: string;
}): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AuthError("That email address does not look right.", 400);
  }
  if (input.password.length < 10) {
    throw new AuthError("Use a password of at least 10 characters.", 400);
  }
  const code = input.inviteCode.trim().toUpperCase();
  if (!code) {
    throw new AuthError(
      "Minted Up is invite-only. Apply for membership and we will send you a code.",
      403,
    );
  }

  const { hash, salt } = await hashPassword(input.password);
  const baseSlug = slugify(input.shopName || input.displayName) || "shop";
  const now = new Date().toISOString();

  return mutate((db) => {
    const invite = db.invites.find((i) => i.code === code);
    if (!invite) throw new AuthError("That invitation code is not recognised.", 403);
    if (invite.usedAt) throw new AuthError("That invitation code has already been used.", 409);
    if (Date.parse(invite.expiresAt) < Date.now()) {
      throw new AuthError("That invitation has expired. Apply again and we will re-issue it.", 403);
    }
    // The code is bound to the address it was issued to, so an invitation
    // cannot be passed around.
    if (invite.email.toLowerCase() !== email) {
      throw new AuthError("That invitation was issued to a different email address.", 403);
    }
    if (db.users.some((u) => u.email === email)) {
      throw new AuthError("That email is already registered.", 409);
    }

    let slug = baseSlug;
    for (let n = 2; db.users.some((u) => u.shop.slug === slug); n += 1) {
      slug = `${baseSlug}-${n}`;
    }

    const user: User = {
      id: newId("usr"),
      email,
      handle: slug,
      displayName: input.displayName.trim() || email.split("@")[0],
      role: "user",
      passwordHash: hash,
      passwordSalt: salt,
      shop: {
        name: input.shopName.trim() || `${input.displayName}'s Cabinet`,
        slug,
        tagline: "",
        about: "",
        location: "",
        bannerColour: "#d8b45a",
        specialties: [],
        returnsPolicy: "14-day returns on all items unless described otherwise.",
        shippingPolicy: "Fully insured tracked shipping. Collection by arrangement.",
      },
      membership: {
        tier: "free",
        status: "active",
        since: now,
        renewsAt: null,
        cancelledAt: null,
      },
      usage: { month: currentMonth(), aiSeo: 0, autocomplete: 0 },
      freeListingsRemaining: FREE_LISTING_ALLOWANCE,
      verified: false,
      invitedBy: invite.createdBy,
      createdAt: now,
      suspended: false,
    };

    db.users.push(user);
    invite.usedAt = now;
    invite.usedBy = user.id;
    return user;
  });
}

/* ------------------------------------------------------------------ *
 * Applications and invitations
 * ------------------------------------------------------------------ */

export async function applyForMembership(input: {
  email: string;
  name: string;
  dealing: string;
  links: string;
}): Promise<Application> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AuthError("That email address does not look right.", 400);
  }
  if (input.dealing.trim().length < 40) {
    throw new AuthError(
      "Tell us a little more about what you deal in — a couple of sentences at least.",
      400,
    );
  }

  return mutate((db) => {
    if (db.users.some((u) => u.email === email)) {
      throw new AuthError("That email already has a Minted Up account.", 409);
    }
    const open = db.applications.find((a) => a.email === email && a.status === "pending");
    if (open) throw new AuthError("You already have an application with us. We will be in touch.", 409);

    const application: Application = {
      id: newId("app"),
      email,
      name: input.name.trim().slice(0, 120),
      dealing: input.dealing.trim().slice(0, 2000),
      links: input.links.trim().slice(0, 500),
      status: "pending",
      notes: "",
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.applications.push(application);
    return application;
  });
}

function inviteCode(): string {
  // Human-transcribable: no O/0, no I/1.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  const body = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `MU-${body.slice(0, 5)}-${body.slice(5, 10)}`;
}

const INVITE_DAYS = 30;

/** Approve an application and issue the single-use code that goes with it. */
export async function approveApplication(
  applicationId: string,
  curatorId: string,
  notes: string,
): Promise<Invite> {
  return mutate((db) => {
    const application = db.applications.find((a) => a.id === applicationId);
    if (!application) throw new AuthError("Application not found.", 404);
    if (application.status === "approved") {
      const existing = db.invites.find((i) => i.applicationId === application.id && !i.usedAt);
      if (existing) return existing;
    }

    application.status = "approved";
    application.notes = notes;
    application.decidedBy = curatorId;
    application.decidedAt = new Date().toISOString();

    const invite: Invite = {
      code: inviteCode(),
      email: application.email,
      applicationId: application.id,
      createdBy: curatorId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString(),
      usedAt: null,
      usedBy: null,
    };
    db.invites.push(invite);
    return invite;
  });
}

export async function rejectApplication(
  applicationId: string,
  curatorId: string,
  notes: string,
): Promise<void> {
  await mutate((db) => {
    const application = db.applications.find((a) => a.id === applicationId);
    if (!application) throw new AuthError("Application not found.", 404);
    application.status = "rejected";
    application.notes = notes;
    application.decidedBy = curatorId;
    application.decidedAt = new Date().toISOString();
  });
}

/** Issue an invitation directly, without an application behind it. */
export async function issueInvite(email: string, curatorId: string): Promise<Invite> {
  const address = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    throw new AuthError("That email address does not look right.", 400);
  }
  return mutate((db) => {
    const invite: Invite = {
      code: inviteCode(),
      email: address,
      applicationId: null,
      createdBy: curatorId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString(),
      usedAt: null,
      usedBy: null,
    };
    db.invites.push(invite);
    return invite;
  });
}

/** Look up an invitation so the registration form can pre-fill and reassure. */
export async function inspectInvite(
  code: string,
): Promise<{ valid: boolean; email: string; reason: string }> {
  const wanted = code.trim().toUpperCase();
  return read((db) => {
    const invite = db.invites.find((i) => i.code === wanted);
    if (!invite) return { valid: false, email: "", reason: "That code is not recognised." };
    if (invite.usedAt) return { valid: false, email: "", reason: "That code has already been used." };
    if (Date.parse(invite.expiresAt) < Date.now()) {
      return { valid: false, email: "", reason: "That invitation has expired." };
    }
    return { valid: true, email: invite.email, reason: "" };
  });
}
