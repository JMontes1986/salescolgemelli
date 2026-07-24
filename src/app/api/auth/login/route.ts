import { NextResponse, type NextRequest } from "next/server";
import {
  AuthenticationError,
  authenticateUser,
} from "@/lib/services/user-service";
import { addAuditLog } from "@/lib/services/audit-service";
import { setAuthCookies } from "@/lib/auth/response-cookies";
import { getDefaultDashboardPath } from "@/lib/auth/route-access";
import {
  AdminTotpConfigurationError,
  getAdminTotpSetup,
  isAdminTotpRequired,
  isAdminTotpSetupEnabled,
  verifyAdminTotpCode,
} from "@/lib/auth/admin-totp";
import {
  consumeLoginRateLimit,
  resetLoginRateLimit,
} from "@/lib/server/rate-limit";
import { getRequestId, logApiDone, logApiError, logApiStart } from "@/lib/server/observability";

function getClientAddress(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return (
    forwardedFor?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function getAttemptKey(request: NextRequest, username: string) {
  return `${getClientAddress(request)}:${username.trim().toLowerCase()}`;
}

export async function POST(request: NextRequest) {
  const route = "/api/auth/login";
  const method = "POST";
  const requestId = getRequestId(request);
  const start = Date.now();
  let username = "";

  logApiStart({ route, method, requestId });

  try {
    const body = (await request.json()) as {
      username?: unknown;
      password?: unknown;
      totpCode?: unknown;
    };

    username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const totpCode =
      typeof body.totpCode === "string" ? body.totpCode.trim() : "";

    if (!username || !password) {
      logApiDone({ route, method, requestId, status: 400, ms: Date.now() - start, meta: { reason: "missing_credentials" } });
      return NextResponse.json(
        { message: "Ingresa usuario y contraseña." },
        { status: 400 },
      );
    }

    const attemptKey = getAttemptKey(request, username);
    const rateLimit = await consumeLoginRateLimit(attemptKey);

    if (rateLimit.limited) {
      logApiDone({ route, method, requestId, status: 429, ms: Date.now() - start, meta: { reason: "rate_limited" } });
      return NextResponse.json(
        {
          message:
            "Demasiados intentos de inicio de sesión. Espera unos minutos e inténtalo de nuevo.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfter),
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const authenticatedUser = await authenticateUser(username, password);

    if (!authenticatedUser) {
      logApiDone({ route, method, requestId, status: 401, ms: Date.now() - start, meta: { reason: "invalid_credentials" } });
      return NextResponse.json(
        { message: "El usuario o la contraseña son incorrectos." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { user, session } = authenticatedUser;

    if (isAdminTotpRequired(user)) {
      if (!totpCode) {
        const setupEnabled = isAdminTotpSetupEnabled();

        logApiDone({ route, method, requestId, status: 202, ms: Date.now() - start, meta: { reason: "mfa_required" } });
        return NextResponse.json(
          {
            mfaRequired: true,
            setupEnabled,
            setup: setupEnabled ? await getAdminTotpSetup(user) : undefined,
            message:
              setupEnabled
                ? "Escanea el QR en FreeOTP e ingresa el código para completar el inicio de sesión."
                : "Ingresa el código de FreeOTP para completar el inicio de sesión.",
          },
          { status: 202, headers: { "Cache-Control": "no-store" } },
        );
      }

      if (!verifyAdminTotpCode(user, totpCode)) {
        logApiDone({ route, method, requestId, status: 401, ms: Date.now() - start, meta: { reason: "invalid_mfa" } });
        return NextResponse.json(
          {
            mfaRequired: true,
            message:
              "El código de FreeOTP no es válido o ya expiró. Revisa la hora del celular e inténtalo de nuevo.",
          },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    await resetLoginRateLimit(attemptKey);

    const response = NextResponse.json(
      {
        user,
        redirectTo: getDefaultDashboardPath(user),
      },
      { headers: { "Cache-Control": "no-store" } },
    );

    await setAuthCookies(response, user, session);
    logApiDone({ route, method, requestId, status: 200, ms: Date.now() - start, meta: { userId: user.id, mfa: isAdminTotpRequired(user) } });

    void addAuditLog({
        userId: user.id,
        userName: user.name,
        action: "USER_LOGIN",
        details: `Usuario ${user.name} (${user.username}) ha iniciado sesión${
          isAdminTotpRequired(user) ? " con FreeOTP" : ""
        }.`,
    }).catch(() => {
      // The login must not fail just because the audit sink is temporarily unavailable.
    });

    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      const status = error.code === "auth_error" ? 503 : 401;
      logApiError({ route, method, requestId, status, ms: Date.now() - start, error, meta: { reason: error.code } });
      return NextResponse.json(
        { message: error.message },
        {
          status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    if (error instanceof AdminTotpConfigurationError) {
      logApiError({ route, method, requestId, status: 503, ms: Date.now() - start, error, meta: { reason: "mfa_configuration" } });

      return NextResponse.json(
        { message: error.message },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    logApiError({ route, method, requestId, status: 500, ms: Date.now() - start, error });
    return NextResponse.json(
      { message: "No se pudo completar el inicio de sesión." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
