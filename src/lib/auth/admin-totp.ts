import { createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { User } from "@/lib/types";

const TOTP_ISSUER = "Molly Ventas";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type AdminTotpSetup = {
  manualSecret: string;
  otpauthUri: string;
  qrDataUrl: string;
  accountName: string;
};

export class AdminTotpConfigurationError extends Error {
  constructor() {
    super(
      "Falta configurar AUTH_COOKIE_SECRET o NEXT_SERVER_AUTH_SECRET con un valor privado de al menos 32 caracteres para activar FreeOTP.",
    );
    this.name = "AdminTotpConfigurationError";
  }
}

function getTotpRootSecret() {
  const secret =
    process.env.AUTH_COOKIE_SECRET ?? process.env.NEXT_SERVER_AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new AdminTotpConfigurationError();
  }

  return secret;
}

export function isAdminTotpSetupEnabled() {
  return (
    process.env.ADMIN_FREEOTP_SETUP_ENABLED === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function base32Encode(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(value: string) {
  const normalized = value
    .replace(/=+$/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let buffer = 0;

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);

    if (index < 0) {
      throw new Error("El secreto TOTP contiene caracteres inválidos.");
    }

    buffer = (buffer << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function deriveAdminTotpSecret(user: User) {
  const digest = createHmac("sha256", getTotpRootSecret())
    .update(`admin-freeotp:${user.id}:${user.username}`)
    .digest();

  return base32Encode(digest.subarray(0, 20));
}

function getHotp(secret: string, counter: number) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hash = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function safeCodeEquals(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export function isAdminTotpRequired(user: User) {
  return user.role === "admin";
}

export function verifyAdminTotpCode(user: User, code: string) {
  const normalizedCode = code.replace(/\s+/g, "");

  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  const secret = deriveAdminTotpSecret(user);
  const currentCounter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);

  for (let skew = -TOTP_WINDOW; skew <= TOTP_WINDOW; skew += 1) {
    if (safeCodeEquals(getHotp(secret, currentCounter + skew), normalizedCode)) {
      return true;
    }
  }

  return false;
}

export async function getAdminTotpSetup(user: User): Promise<AdminTotpSetup> {
  const manualSecret = deriveAdminTotpSecret(user);
  const accountName = `Administrador ${user.username}`;
  const label = `${TOTP_ISSUER}:${accountName}`;
  const otpauthUri =
    `otpauth://totp/${encodeURIComponent(label)}` +
    `?secret=${encodeURIComponent(manualSecret)}` +
    `&issuer=${encodeURIComponent(TOTP_ISSUER)}` +
    "&algorithm=SHA1" +
    `&digits=${TOTP_DIGITS}` +
    `&period=${TOTP_PERIOD_SECONDS}`;

  return {
    accountName,
    manualSecret,
    otpauthUri,
    qrDataUrl: await QRCode.toDataURL(otpauthUri, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 6,
    }),
  };
}
