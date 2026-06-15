import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase";
import { refreshAuthenticatedSession } from "@/lib/services/user-service";
import { setAuthCookies } from "@/lib/auth/response-cookies";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
} from "@/lib/auth/session-cookie";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

function buildSupabaseRestUrl(pathParts: string[], request: NextRequest) {
  const { supabaseUrl } = getSupabaseEnv();
  const url = new URL(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${pathParts.join("/")}`,
  );

  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

async function forwardSupabaseRequest(
  request: NextRequest,
  pathParts: string[],
  accessToken: string | undefined,
) {
  const { supabaseAnonKey } = getSupabaseEnv();
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  return fetch(buildSupabaseRestUrl(pathParts, request), {
    method: request.method,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken ?? supabaseAnonKey}`,
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      ...(request.headers.get("prefer")
        ? { Prefer: request.headers.get("prefer") as string }
        : {}),
    },
    body,
    cache: "no-store",
  });
}

async function handleRequest(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value;

  let supabaseResponse = await forwardSupabaseRequest(
    request,
    path,
    accessToken,
  );
  let refreshedAuth:
    | Awaited<ReturnType<typeof refreshAuthenticatedSession>>
    | null = null;

  if (supabaseResponse.status === 401 && refreshToken) {
    try {
      refreshedAuth = await refreshAuthenticatedSession(refreshToken);
      if (refreshedAuth) {
        supabaseResponse = await forwardSupabaseRequest(
          request,
          path,
          refreshedAuth.session.access_token,
        );
      }
    } catch {
      refreshedAuth = null;
    }
  }

  const responseBody = await supabaseResponse.text();
  const response = new NextResponse(responseBody, {
    status: supabaseResponse.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type":
        supabaseResponse.headers.get("content-type") ?? "application/json",
    },
  });

  if (refreshedAuth) {
    await setAuthCookies(response, refreshedAuth.user, refreshedAuth.session);
  }

  return response;
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handleRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handleRequest(request, context);
}
