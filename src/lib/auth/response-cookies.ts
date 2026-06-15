import type { NextResponse } from "next/server";
import type { User } from "@/lib/types";
import type { SupabaseAuthSession } from "@/lib/services/user-service";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  AUTH_SESSION_COOKIE,
  createAuthSessionCookie,
  getAuthCookieOptions,
} from "@/lib/auth/session-cookie";

const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function getSessionExpiresAt(session: SupabaseAuthSession) {
  return (
    session.expires_at ??
    Math.floor(Date.now() / 1000) + (session.expires_in ?? 60 * 60 * 8)
  );
}

export async function setAuthCookies(
  response: NextResponse,
  user: User,
  session: SupabaseAuthSession,
) {
  const expiresAt = getSessionExpiresAt(session);
  const maxAge = Math.max(expiresAt - Math.floor(Date.now() / 1000), 60);
  const signedSession = await createAuthSessionCookie({ user, expiresAt });

  response.cookies.set(
    AUTH_ACCESS_COOKIE,
    session.access_token,
    getAuthCookieOptions(maxAge),
  );
  response.cookies.set(
    AUTH_REFRESH_COOKIE,
    session.refresh_token,
    getAuthCookieOptions(REFRESH_COOKIE_MAX_AGE_SECONDS),
  );
  response.cookies.set(
    AUTH_SESSION_COOKIE,
    signedSession,
    getAuthCookieOptions(maxAge),
  );
}

export function clearAuthCookies(response: NextResponse) {
  const expiredCookieOptions = getAuthCookieOptions(0);

  response.cookies.set(AUTH_ACCESS_COOKIE, "", expiredCookieOptions);
  response.cookies.set(AUTH_REFRESH_COOKIE, "", expiredCookieOptions);
  response.cookies.set(AUTH_SESSION_COOKIE, "", expiredCookieOptions);
}
