type RatePolicy = { limit: number; windowMs: number };
type Bucket = { count: number; startedAt: number };
type RateState = { buckets: Map<string, Bucket> };

const globalSecurity = globalThis as typeof globalThis & { __mintedUpRateState?: RateState };
const state: RateState = (globalSecurity.__mintedUpRateState ??= { buckets: new Map() });
const MAX_BUCKETS = 5_000;

export class SecurityError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SecurityError";
  }
}

function firstHeader(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

function clientAddress(request: Request): string {
  return firstHeader(request.headers.get("x-forwarded-for")) ||
    firstHeader(request.headers.get("x-real-ip")) ||
    "unknown";
}

/**
 * Browser CSRF/origin boundary for state-changing API calls.
 * Server-to-server clients may omit Origin, but a browser explicitly reporting
 * a cross-site request is rejected. Forwarded host/proto are honoured on Vercel.
 */
export function assertSameOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new SecurityError("Cross-site requests are not allowed.", 403);
  }

  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return;

  let supplied: string;
  try {
    supplied = new URL(rawOrigin).origin;
  } catch {
    throw new SecurityError("Invalid request origin.", 403);
  }

  const direct = new URL(request.url).origin;
  const forwardedHost = firstHeader(request.headers.get("x-forwarded-host")) ||
    firstHeader(request.headers.get("host"));
  const forwardedProto = firstHeader(request.headers.get("x-forwarded-proto"));
  const forwarded = forwardedHost && forwardedProto ? `${forwardedProto}://${forwardedHost}` : "";

  if (supplied !== direct && supplied !== forwarded) {
    throw new SecurityError("Cross-site requests are not allowed.", 403);
  }
}

/**
 * Bounded in-process throttle for the current prototype. This protects one
 * running instance from bursts and accidental loops. It is deliberately not
 * described as a production distributed rate limiter: multi-instance Vercel
 * deployment must move this state to shared infrastructure before launch.
 */
export function enforceRateLimit(
  request: Request,
  scope: string,
  policy: RatePolicy,
  subject = "",
): void {
  const now = Date.now();
  const key = `${scope}:${clientAddress(request)}:${subject.toLowerCase()}`;
  const bucket = state.buckets.get(key);

  if (!bucket || now - bucket.startedAt >= policy.windowMs) {
    state.buckets.set(key, { count: 1, startedAt: now });
  } else {
    if (bucket.count >= policy.limit) {
      throw new SecurityError("Too many requests. Please try again shortly.", 429);
    }
    bucket.count += 1;
  }

  if (state.buckets.size > MAX_BUCKETS) {
    for (const [candidate, value] of state.buckets) {
      if (now - value.startedAt >= policy.windowMs) state.buckets.delete(candidate);
      if (state.buckets.size <= MAX_BUCKETS) break;
    }
  }
}
