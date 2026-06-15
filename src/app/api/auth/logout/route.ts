import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signOutAuthenticatedUser } from "@/lib/services/user-service";
import { clearAuthCookies } from "@/lib/auth/response-cookies";
import { AUTH_ACCESS_COOKIE } from "@/lib/auth/session-cookie";

export async function POST() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );

  try {
    if (accessToken) {
      await signOutAuthenticatedUser(accessToken);
    }
  } catch {
    // Cookies are cleared locally even if the upstream logout request is unavailable.
  }

  clearAuthCookies(response);
  return response;
}
