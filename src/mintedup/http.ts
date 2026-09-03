import { NextResponse } from "next/server";

/** One error shape for every Minted Up endpoint, so the client can be dumb. */
export function fail(error: unknown): NextResponse {
  // Domain errors deliberately carry an HTTP status. Keep the adapter generic
  // so new domain modules (curation, orders, quotas, payments) do not need to be
  // imported here just to preserve their intended 4xx response.
  if (error instanceof Error) {
    const status = (error as Error & { status?: unknown }).status;
    if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599) {
      return NextResponse.json({ error: error.message }, { status });
    }
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  console.error("[mintedup]", error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
