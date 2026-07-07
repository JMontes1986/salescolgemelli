import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  refreshAuthenticatedSession,
} from "@/lib/services/user-service";
import { setAuthCookies, clearAuthCookies } from "@/lib/auth/response-cookies";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  AUTH_SESSION_COOKIE,
  verifyAuthSessionCookie,
} from "@/lib/auth/session-cookie";

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value;
  const signedSession = await verifyAuthSessionCookie(
    cookieStore.get(AUTH_SESSION_COOKIE)?.value,
  );

  try {
    if (accessToken) {
      const user = await getAuthenticatedUser(accessToken);

      if (user) {
        return NextResponse.json(
          { user },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    if (refreshToken) {
      const refreshedAuth = await refreshAuthenticatedSession(refreshToken);

      if (refreshedAuth) {
        const response = NextResponse.json(
          { user: refreshedAuth.user },
          { headers: { "Cache-Control": "no-store" } },
        );
        await setAuthCookies(
          response,
          refreshedAuth.user,
          refreshedAuth.session,
        );
        return response;
      }
    }

    if (signedSession) {
      return NextResponse.json(
        { user: signedSession.user },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch {
    // Fall through to a signed-session check or an empty session response.
    if (signedSession) {
      return NextResponse.json(
        { user: signedSession.user },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const response = NextResponse.json(
    { user: null },
    { headers: { "Cache-Control": "no-store" } },
  );
  clearAuthCookies(response);
  return response;
}
