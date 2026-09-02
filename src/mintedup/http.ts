import { NextResponse } from "next/server";
import { AuthError } from "./auth";
import { ListingError } from "./listings";

/** One error shape for every Minted Up endpoint, so the client can be dumb. */
export function fail(error: unknown): NextResponse {
  if (error instanceof AuthError || error instanceof ListingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
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
