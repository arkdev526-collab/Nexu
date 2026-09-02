import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { mutate, newId, read } from "./store";
import type { Role, Session, User } from "./types";

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

export async function requireRole(role: Role): Promise<User> {
  const user = await requireUser();
  if (role === "admin" && user.role !== "admin") {
    throw new AuthError("Administrator access required.", 403);
  }
  return user;
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

export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
  shopName: string;
}): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AuthError("That email address does not look right.", 400);
  }
  if (input.password.length < 10) {
    throw new AuthError("Use a password of at least 10 characters.", 400);
  }
  const { hash, salt } = await hashPassword(input.password);
  const baseSlug = slugify(input.shopName || input.displayName) || "shop";

  return mutate((db) => {
    if (db.users.some((u) => u.email === email)) {
      throw new AuthError("That email is already registered.", 409);
    }
    // First account bootstraps the admin backend; everyone after is a seller.
    const role: Role = db.users.length === 0 ? "admin" : "user";
    let slug = baseSlug;
    for (let n = 2; db.users.some((u) => u.shop.slug === slug); n += 1) {
      slug = `${baseSlug}-${n}`;
    }
    const user: User = {
      id: newId("usr"),
      email,
      handle: slug,
      displayName: input.displayName.trim() || email.split("@")[0],
      role,
      passwordHash: hash,
      passwordSalt: salt,
      shop: {
        name: input.shopName.trim() || `${input.displayName}'s Cabinet`,
        slug,
        tagline: "",
        about: "",
        location: "",
        specialties: [],
        returnsPolicy: "14-day returns on all items unless described otherwise.",
        shippingPolicy: "Fully insured tracked shipping. Collection by arrangement.",
      },
      createdAt: new Date().toISOString(),
      suspended: false,
    };
    db.users.push(user);
    return user;
  });
}
