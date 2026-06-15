import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  verifyAuthSessionCookie,
} from "@/lib/auth/session-cookie";
import {
  canAccessDashboardPath,
  getDefaultDashboardPath,
} from "@/lib/auth/route-access";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifyAuthSessionCookie(
    request.cookies.get(AUTH_SESSION_COOKIE)?.value,
  );

  if (pathname === "/" && session) {
    return NextResponse.redirect(
      new URL(getDefaultDashboardPath(session.user), request.url),
    );
  }

  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!canAccessDashboardPath(session.user, pathname)) {
    return NextResponse.redirect(
      new URL(getDefaultDashboardPath(session.user), request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*"],
};
