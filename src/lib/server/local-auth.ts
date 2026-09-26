import { createHash, timingSafeEqual } from "node:crypto";

import type { User, UserRole } from "@/lib/types";
import { getPermissionsForRole } from "@/lib/roles";
import {
  getSupabaseEnv,
  getSupabaseServiceRoleKey,
} from "@/lib/supabase";

type StoredLocalUser = User & {
  passwordHash?: string | null;
};

const LEGACY_LOCAL_ROLES = new Set<UserRole>(["cashier", "seller"]);
const LOGIN_IDENTIFIER_PATTERN = /^[\p{L}\p{N}@._\-\s]{1,180}$/u;

function serviceHeaders() {
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function queryLocalUser(
  field: "username" | "name",
  loginIdentifier: string,
) {
  const { supabaseUrl } = getSupabaseEnv();
  const url = new URL(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/users`,
  );

  url.searchParams.set(
    "select",
    'id,name,username,role,permissions,"avatarUrl","passwordHash"',
  );
  url.searchParams.set(field, `ilike.${loginIdentifier}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: serviceHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudo validar el usuario local de forma segura.");
  }

  const rows = (await response.json()) as StoredLocalUser[];
  return rows[0] ?? null;
}

function passwordMatchesSha256(password: string, storedHash?: string | null) {
  if (!storedHash || !/^[0-9a-f]{64}$/i.test(storedHash)) {
    return false;
  }

  const expected = Buffer.from(storedHash, "hex");
  const actual = createHash("sha256").update(password, "utf8").digest();

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sanitizeLocalUser(storedUser: StoredLocalUser): User {
  return {
    id: storedUser.id,
    name: storedUser.name,
    username: storedUser.username,
    role: storedUser.role,
    permissions: storedUser.permissions?.length
      ? storedUser.permissions
      : getPermissionsForRole(storedUser.role),
    avatarUrl: storedUser.avatarUrl,
  };
}

/**
 * Transitional compatibility for cashier/seller accounts that still live only
 * in public.users. This helper runs only on the server with service_role and
 * never issues local access/refresh bearer tokens.
 */
export async function authenticateLegacyLocalUser(
  username: string,
  password: string,
): Promise<User | null> {
  const loginIdentifier = username.trim();

  if (
    !loginIdentifier ||
    !password ||
    !LOGIN_IDENTIFIER_PATTERN.test(loginIdentifier)
  ) {
    return null;
  }

  const byUsername = await queryLocalUser("username", loginIdentifier);
  const storedUser =
    byUsername ??
    (!loginIdentifier.includes("@")
      ? await queryLocalUser("name", loginIdentifier)
      : null);

  if (!storedUser || !LEGACY_LOCAL_ROLES.has(storedUser.role)) {
    return null;
  }

  if (!passwordMatchesSha256(password, storedUser.passwordHash)) {
    return null;
  }

  return sanitizeLocalUser(storedUser);
}
