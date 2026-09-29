import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export function noStoreJson(body: unknown, status = 200, extraHeaders?: HeadersInit) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

export function hasValidJsonRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return false;
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const raw = forwarded || request.headers.get("x-real-ip") || "unknown";
  const pepper = process.env.SELF_SERVICE_SESSION_SECRET || "development";
  return createHash("sha256").update(`${pepper}:ip:${raw}`).digest("hex");
}

export async function enforceSelfServiceRateLimit(request: Request, namespace: string, max: number, windowSeconds: number, subject = "") {
  const result = await consumeRateLimit(`${namespace}:${requestFingerprint(request)}:${subject}`, max, windowSeconds);
  return result.limited
    ? noStoreJson({ message: "Demasiados intentos. Intente nuevamente más tarde." }, 429, { "Retry-After": String(result.retryAfter) })
    : null;
}
