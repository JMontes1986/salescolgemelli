import { NextResponse, type NextRequest } from "next/server";
import {
  AuthenticationError,
  authenticateUser,
  getSupabaseMfaSetup,
  sessionHasSupabaseMfa,
  userNeedsSupabaseMfa,
  verifySupabaseMfaCode,
} from "@/lib/services/user-service";
import { addAuditLog } from "@/lib/services/audit-service";
import { setAuthCookies } from "@/lib/auth/response-cookies";
import { getDefaultDashboardPath } from "@/lib/auth/route-access";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

type LoginAttempt = {
  count: number;
  resetAt: number;
};

const loginAttempts = new Map<string, LoginAttempt>();

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

function consumeLoginAttempt(key: string) {
  const now = Date.now();
  const currentAttempt = loginAttempts.get(key);

  if (!currentAttempt || currentAttempt.resetAt <= now) {
    loginAttempts.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { limited: false, retryAfter: 0 };
  }

  if (currentAttempt.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return {
      limited: true,
      retryAfter: Math.ceil((currentAttempt.resetAt - now) / 1000),
    };
  }

  currentAttempt.count += 1;
  loginAttempts.set(key, currentAttempt);
  return { limited: false, retryAfter: 0 };
}

export async function POST(request: NextRequest) {
  let username = "";

  try {
    const body = (await request.json()) as {
      username?: unknown;
      password?: unknown;
      totpCode?: unknown;
      mfaFactorId?: unknown;
    };

    username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const totpCode =
      typeof body.totpCode === "string" ? body.totpCode.trim() : "";
    const mfaFactorId =
      typeof body.mfaFactorId === "string" ? body.mfaFactorId.trim() : "";

    if (!username || !password) {
      return NextResponse.json(
        { message: "Ingresa usuario y contraseña." },
        { status: 400 },
      );
    }

    const attemptKey = getAttemptKey(request, username);
    const rateLimit = consumeLoginAttempt(attemptKey);

    if (rateLimit.limited) {
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
      return NextResponse.json(
        { message: "El usuario o la contraseña son incorrectos." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    let { user, session } = authenticatedUser;

    if (userNeedsSupabaseMfa(user) && !sessionHasSupabaseMfa(session)) {
      if (!authenticatedUser.authUser) {
        return NextResponse.json(
          {
            message:
              "Este usuario necesita MFA nativo de Supabase para registrar ventas. Créalo o vuelve a crearlo desde Supabase Authentication antes de usar acciones financieras.",
          },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }

      if (!totpCode) {
        const setup = await getSupabaseMfaSetup(
          authenticatedUser,
          mfaFactorId || undefined,
        );

        return NextResponse.json(
          {
            mfaRequired: true,
            setupEnabled: Boolean(setup),
            setup: setup ?? undefined,
            message:
              setup
                ? "Escanea el QR de MFA de Supabase en FreeOTP e ingresa el código para elevar la sesión."
                : "Ingresa el código de FreeOTP registrado en Supabase para elevar la sesión.",
          },
          { status: 202, headers: { "Cache-Control": "no-store" } },
        );
      }

      const mfaAuthenticatedUser = await verifySupabaseMfaCode(
        authenticatedUser,
        totpCode,
        mfaFactorId || undefined,
      );

      if (!mfaAuthenticatedUser) {
        return NextResponse.json(
          {
            mfaRequired: true,
            message:
              "El código de FreeOTP no es válido, expiró o no pertenece al MFA de Supabase de este usuario.",
          },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }

      user = mfaAuthenticatedUser.user;
      session = mfaAuthenticatedUser.session;
    }

    loginAttempts.delete(attemptKey);

    const response = NextResponse.json(
      {
        user,
        redirectTo: getDefaultDashboardPath(user),
      },
      { headers: { "Cache-Control": "no-store" } },
    );

    await setAuthCookies(response, user, session);

    try {
      await addAuditLog({
        userId: user.id,
        userName: user.name,
        action: "USER_LOGIN",
        details: `Usuario ${user.name} (${user.username}) ha iniciado sesión${
          userNeedsSupabaseMfa(user) ? " con MFA Supabase" : ""
        }.`,
      });
    } catch {
      // The login must not fail just because the audit sink is temporarily unavailable.
    }

    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { message: error.message },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("Login failed in auth route.");
    return NextResponse.json(
      { message: "No se pudo completar el inicio de sesión." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
