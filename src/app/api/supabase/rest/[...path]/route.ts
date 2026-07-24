import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, isJwtLikeToken } from "@/lib/supabase";
import { refreshAuthenticatedSession } from "@/lib/services/user-service";
import { setAuthCookies } from "@/lib/auth/response-cookies";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
} from "@/lib/auth/session-cookie";
import { getRequestId, logApiDone, logApiStart } from "@/lib/server/observability";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

const STRONG_SESSION_REFRESH_AFTER_SECONDS = 12 * 60;

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

function isBodyAllowed(method: string) {
  return method !== "GET" && method !== "HEAD";
}

function decodeJwtIssuedAt(accessToken?: string) {
  if (!accessToken || !accessToken.includes(".")) {
    return null;
  }

  const [, encodedPayload] = accessToken.split(".");

  if (!encodedPayload) {
    return null;
  }

  try {
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const payload = JSON.parse(
      Buffer.from(padded, "base64").toString("utf8"),
    ) as { iat?: unknown };

    return typeof payload.iat === "number" ? payload.iat : null;
  } catch {
    return null;
  }
}

function shouldRefreshBeforeForwarding(
  request: NextRequest,
  accessToken?: string,
) {
  if (!isBodyAllowed(request.method)) {
    return false;
  }

  const issuedAt = decodeJwtIssuedAt(accessToken);

  if (!issuedAt) {
    return false;
  }

  return (
    Math.floor(Date.now() / 1000) - issuedAt >=
    STRONG_SESSION_REFRESH_AFTER_SECONDS
  );
}

function isExpiredStrongSessionResponse(status: number, responseBody: string) {
  if (status !== 400) {
    return false;
  }

  try {
    const parsed = JSON.parse(responseBody) as { message?: unknown };
    return (
      typeof parsed.message === "string" &&
      parsed.message.includes("La sesión superó 15 minutos")
    );
  } catch {
    return responseBody.includes("La sesión superó 15 minutos");
  }
}

async function forwardSupabaseRequest(
  request: NextRequest,
  pathParts: string[],
  accessToken: string | undefined,
  body: string | undefined,
) {
  const { supabaseAnonKey } = getSupabaseEnv();

  return fetch(buildSupabaseRestUrl(pathParts, request), {
    method: request.method,
    headers: {
      apikey: supabaseAnonKey,
      ...(isJwtLikeToken(accessToken ?? supabaseAnonKey)
        ? { Authorization: `Bearer ${accessToken ?? supabaseAnonKey}` }
        : {}),
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
  const route = "/api/supabase/rest";
  const method = request.method;
  const requestId = getRequestId(request);
  const start = Date.now();
  const { path = [] } = await context.params;
  const proxiedPath = path.join("/");

  logApiStart({ route, method, requestId, meta: { path: proxiedPath } });
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value;
  const requestBody = isBodyAllowed(request.method)
    ? await request.text()
    : undefined;

  let refreshedAuth:
    | Awaited<ReturnType<typeof refreshAuthenticatedSession>>
    | null = null;
  let forwardedAccessToken = accessToken;

  if (
    refreshToken &&
    shouldRefreshBeforeForwarding(request, forwardedAccessToken)
  ) {
    try {
      refreshedAuth = await refreshAuthenticatedSession(refreshToken);
      if (refreshedAuth) {
        forwardedAccessToken = refreshedAuth.session.access_token;
      }
    } catch {
      refreshedAuth = null;
    }
  }

  let supabaseResponse = await forwardSupabaseRequest(
    request,
    path,
    forwardedAccessToken,
    requestBody,
  );
  let responseBody = await supabaseResponse.text();

  if (
    refreshToken &&
    (supabaseResponse.status === 401 ||
      isExpiredStrongSessionResponse(supabaseResponse.status, responseBody))
  ) {
    try {
      refreshedAuth = await refreshAuthenticatedSession(refreshToken);
      if (refreshedAuth) {
        supabaseResponse = await forwardSupabaseRequest(
          request,
          path,
          refreshedAuth.session.access_token,
          requestBody,
        );
        responseBody = await supabaseResponse.text();
      }
    } catch {
      refreshedAuth = null;
    }
  }

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

  logApiDone({
    route,
    method,
    requestId,
    status: supabaseResponse.status,
    ms: Date.now() - start,
    meta: { path: proxiedPath, refreshedSession: Boolean(refreshedAuth) },
  });

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
