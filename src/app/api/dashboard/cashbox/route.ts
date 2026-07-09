import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AuditLogAction, CashboxSession } from "@/lib/types";
import {
  AUTH_SESSION_COOKIE,
  verifyAuthSessionCookie,
} from "@/lib/auth/session-cookie";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

type SupabaseFailure = {
  ok: false;
  status: number;
  message: string;
};

const cashboxSelectColumns =
  'id,"userId","userName",status,"openingBalance","closingBalance","openedAt","closedAt","totalSales"';
const recordIdPattern = /^[0-9A-Za-z_-]{1,80}$/;

async function getDashboardSession() {
  const cookieStore = await cookies();
  return verifyAuthSessionCookie(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
}

function userCanUseCashbox(permissions: string[]) {
  return permissions.includes("cashbox");
}

function getServiceHeaders(prefer?: string) {
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function buildSupabaseRestUrl(path: string) {
  const { supabaseUrl } = getSupabaseEnv();
  return new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`);
}

async function readSupabaseResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<{ ok: true; data: T } | SupabaseFailure> {
  const responseText = await response.text();

  if (!response.ok) {
    let message = responseText || fallbackMessage;

    try {
      const parsed = JSON.parse(responseText) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        message = parsed.message;
      }
    } catch {
      // Keep the raw response text.
    }

    return { ok: false, status: response.status, message };
  }

  return {
    ok: true,
    data: responseText ? (JSON.parse(responseText) as T) : ([] as T),
  };
}

async function fetchCashboxSessions(query: Record<string, string> = {}) {
  const url = buildSupabaseRestUrl("cashboxSessions");
  url.searchParams.set("select", cashboxSelectColumns);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getServiceHeaders(),
    cache: "no-store",
  });

  return readSupabaseResponse<CashboxSession[]>(
    response,
    "No se pudieron consultar las sesiones de caja.",
  );
}

async function recordCashboxAudit(
  action: AuditLogAction,
  userId: string,
  userName: string,
  details: string,
) {
  const url = buildSupabaseRestUrl("auditLogs");

  await fetch(url.toString(), {
    method: "POST",
    headers: getServiceHeaders("return=minimal"),
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      userId,
      userName,
      action,
      details,
    }),
    cache: "no-store",
  });
}

function normalizeMoneyValue(value: unknown, fieldName: string) {
  const normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    throw new Error(`${fieldName} no tiene un valor valido.`);
  }

  return normalized;
}

export async function GET() {
  try {
    const session = await getDashboardSession();

    if (!session?.user) {
      return NextResponse.json(
        { message: "Se requiere iniciar sesion para consultar caja." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!userCanUseCashbox(session.user.permissions)) {
      return NextResponse.json(
        { message: "No tiene permiso para consultar caja." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const [activeResponse, historyResponse] = await Promise.all([
      fetchCashboxSessions({
        userId: `eq.${session.user.id}`,
        status: "eq.open",
        limit: "1",
      }),
      fetchCashboxSessions({ order: "openedAt.desc" }),
    ]);

    if (!activeResponse.ok) {
      return NextResponse.json(
        { message: activeResponse.message },
        { status: activeResponse.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!historyResponse.ok) {
      return NextResponse.json(
        { message: historyResponse.message },
        { status: historyResponse.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        activeSession: activeResponse.data[0] ?? null,
        history: historyResponse.data,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Dashboard cashbox lookup failed.", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudieron consultar los datos de caja.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getDashboardSession();

    if (!session?.user) {
      return NextResponse.json(
        { message: "Se requiere iniciar sesion para abrir caja." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!userCanUseCashbox(session.user.permissions)) {
      return NextResponse.json(
        { message: "No tiene permiso para abrir caja." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = (await request.json()) as { openingBalance?: unknown };
    const openingBalance = normalizeMoneyValue(body.openingBalance, "El saldo de apertura");

    if (openingBalance <= 0) {
      return NextResponse.json(
        { message: "El saldo de apertura debe ser mayor que cero." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const activeResponse = await fetchCashboxSessions({
      userId: `eq.${session.user.id}`,
      status: "eq.open",
      limit: "1",
    });

    if (!activeResponse.ok) {
      return NextResponse.json(
        { message: activeResponse.message },
        { status: activeResponse.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (activeResponse.data.length > 0) {
      return NextResponse.json(
        { message: "Ya existe una sesion de caja abierta para este usuario." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const url = buildSupabaseRestUrl("cashboxSessions");
    url.searchParams.set("select", cashboxSelectColumns);

    const insertResponse = await fetch(url.toString(), {
      method: "POST",
      headers: getServiceHeaders("return=representation"),
      body: JSON.stringify({
        userId: session.user.id,
        userName: session.user.name,
        status: "open",
        openingBalance,
        openedAt: new Date().toISOString(),
        totalSales: 0,
      }),
      cache: "no-store",
    });
    const savedSession = await readSupabaseResponse<CashboxSession[]>(
      insertResponse,
      "No se pudo abrir la caja en Supabase.",
    );

    if (!savedSession.ok) {
      return NextResponse.json(
        { message: savedSession.message },
        { status: savedSession.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    await recordCashboxAudit(
      "CASHBOX_OPEN",
      session.user.id,
      session.user.name,
      `Caja abierta con un saldo inicial de ${openingBalance}.`,
    );

    return NextResponse.json(
      { session: savedSession.data[0] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Dashboard cashbox open failed.", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "No se pudo abrir la caja.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getDashboardSession();

    if (!session?.user) {
      return NextResponse.json(
        { message: "Se requiere iniciar sesion para cerrar caja." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!userCanUseCashbox(session.user.permissions)) {
      return NextResponse.json(
        { message: "No tiene permiso para cerrar caja." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = (await request.json()) as {
      sessionId?: unknown;
      closingBalance?: unknown;
    };
    const sessionId = String(body.sessionId ?? "").trim();
    const closingBalance = normalizeMoneyValue(body.closingBalance, "El saldo de cierre");

    if (!recordIdPattern.test(sessionId)) {
      return NextResponse.json(
        { message: "La sesion de caja no es valida." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (closingBalance < 0) {
      return NextResponse.json(
        { message: "El saldo de cierre no puede ser negativo." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const existingResponse = await fetchCashboxSessions({
      id: `eq.${sessionId}`,
      limit: "1",
    });

    if (!existingResponse.ok) {
      return NextResponse.json(
        { message: existingResponse.message },
        { status: existingResponse.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    const existingSession = existingResponse.data[0];

    if (
      !existingSession ||
      existingSession.status !== "open" ||
      existingSession.userId !== session.user.id
    ) {
      return NextResponse.json(
        { message: "La sesion no existe o ya ha sido cerrada." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const url = buildSupabaseRestUrl("cashboxSessions");
    url.searchParams.set("select", cashboxSelectColumns);
    url.searchParams.set("id", `eq.${sessionId}`);

    const updateResponse = await fetch(url.toString(), {
      method: "PATCH",
      headers: getServiceHeaders("return=representation"),
      body: JSON.stringify({
        status: "closed",
        closingBalance,
        closedAt: new Date().toISOString(),
      }),
      cache: "no-store",
    });
    const updatedSession = await readSupabaseResponse<CashboxSession[]>(
      updateResponse,
      "No se pudo cerrar la caja en Supabase.",
    );

    if (!updatedSession.ok) {
      return NextResponse.json(
        { message: updatedSession.message },
        { status: updatedSession.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    await recordCashboxAudit(
      "CASHBOX_CLOSE",
      session.user.id,
      session.user.name,
      `Caja cerrada con un saldo final de ${closingBalance}.`,
    );

    return NextResponse.json(
      { session: updatedSession.data[0] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Dashboard cashbox close failed.", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "No se pudo cerrar la caja.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
