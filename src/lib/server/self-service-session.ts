import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const SELF_SERVICE_SESSION_COOKIE = "sg_self_service_session";
const SESSION_MAX_AGE_SECONDS = 6 * 60 * 60;

export type SelfServiceSession = {
  v: 1;
  subjectHash: string;
  purchaseIds: string[];
  issuedAt: number;
  expiresAt: number;
};

function secret() {
  const value = process.env.SELF_SERVICE_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SELF_SERVICE_SESSION_SECRET debe tener al menos 32 caracteres.");
  }
  return value;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function hashSelfServiceSubject(phone: string) {
  return createHash("sha256").update(`${secret()}:phone:${phone}`).digest("hex");
}

export function createSelfServiceSession(phone: string, purchaseIds: string[]) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SelfServiceSession = {
    v: 1,
    subjectHash: hashSelfServiceSubject(phone),
    purchaseIds: [...new Set(purchaseIds)].slice(-20),
    issuedAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS,
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function verifySelfServiceSession(value?: string | null): SelfServiceSession | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [encoded, supplied] = parts;
  const expected = signature(encoded);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SelfServiceSession;
    const now = Math.floor(Date.now() / 1000);
    if (payload.v !== 1 || payload.expiresAt <= now || payload.issuedAt > now + 60 || !Array.isArray(payload.purchaseIds)) return null;
    if (!payload.purchaseIds.every((id) => /^[0-9A-Za-z_-]{1,80}$/.test(id))) return null;
    return payload;
  } catch {
    return null;
  }
}

export function selfServiceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
