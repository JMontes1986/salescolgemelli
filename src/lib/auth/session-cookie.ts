import type { User } from "@/lib/types";

export const AUTH_ACCESS_COOKIE = "sg_access_token";
export const AUTH_REFRESH_COOKIE = "sg_refresh_token";
export const AUTH_SESSION_COOKIE = "sg_app_session";

const AUTH_SESSION_VERSION =
  process.env.AUTH_SESSION_VERSION?.trim() || "2";
const MIN_SIGNING_SECRET_LENGTH = 32;

export type AuthSessionPayload = {
  version: string;
  user: User;
  expiresAt: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getSigningSecret() {
  const secret =
    process.env.AUTH_COOKIE_SECRET ?? process.env.NEXT_SERVER_AUTH_SECRET;

  if (!secret || secret.length < MIN_SIGNING_SECRET_LENGTH) {
    throw new Error(
      "AUTH_COOKIE_SECRET debe estar configurado con al menos 32 caracteres. La aplicación no usará secretos públicos ni valores de desarrollo como fallback.",
    );
  }

  return secret;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function getSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSigningSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signValue(value: string) {
  const key = await getSigningKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

async function verifyValue(value: string, signature: string) {
  try {
    const key = await getSigningKey();
    return await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      encoder.encode(value),
    );
  } catch {
    return false;
  }
}

export async function createAuthSessionCookie(
  payload: Omit<AuthSessionPayload, "version">,
) {
  const encodedPayload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        ...payload,
        version: AUTH_SESSION_VERSION,
      }),
    ),
  );
  const signature = await signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyAuthSessionCookie(
  cookieValue?: string | null,
): Promise<AuthSessionPayload | null> {
  if (!cookieValue) {
    return null;
  }

  const [encodedPayload, signature, ...extraParts] = cookieValue.split(".");

  if (!encodedPayload || !signature || extraParts.length > 0) {
    return null;
  }

  if (!(await verifyValue(encodedPayload, signature))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      decoder.decode(fromBase64Url(encodedPayload)),
    ) as AuthSessionPayload;

    if (
      payload.version !== AUTH_SESSION_VERSION ||
      !payload.user?.id ||
      !payload.user.role ||
      !Array.isArray(payload.user.permissions) ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getAuthCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
