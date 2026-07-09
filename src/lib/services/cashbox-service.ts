import type { CashboxSession, User } from "@/lib/types";

type CashboxPayload = {
  activeSession?: CashboxSession | null;
  history?: CashboxSession[];
  session?: CashboxSession;
  message?: string;
};

async function requestDashboardCashbox(
  method: "GET" | "POST" | "PATCH",
  body?: unknown,
): Promise<CashboxPayload> {
  const response = await fetch("/api/dashboard/cashbox", {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const responseBody = (await response.json().catch(() => null)) as CashboxPayload | null;

  if (!response.ok) {
    throw new Error(
      responseBody?.message ||
        "No se pudieron guardar los datos de caja en Supabase.",
    );
  }

  return responseBody ?? {};
}

async function getCashboxSnapshot() {
  return requestDashboardCashbox("GET");
}

export async function getActiveSessionForUser(
  _userId: string,
): Promise<CashboxSession | null> {
  const snapshot = await getCashboxSnapshot();
  return snapshot.activeSession ?? null;
}

export async function getCashboxHistory(): Promise<CashboxSession[]> {
  const snapshot = await getCashboxSnapshot();
  return snapshot.history ?? [];
}

export async function openCashboxSession(
  openingBalance: number,
  user: User,
): Promise<CashboxSession> {
  const activeSession = await getActiveSessionForUser(user.id);
  if (activeSession) {
    throw new Error("Ya existe una sesion de caja abierta para este usuario.");
  }

  const response = await requestDashboardCashbox("POST", {
    openingBalance,
  });

  if (!response.session) {
    throw new Error("Supabase no devolvio la sesion de caja abierta.");
  }

  return response.session;
}

export async function closeCashboxSession(
  sessionId: string,
  closingBalance: number,
  user: User,
): Promise<void> {
  await requestDashboardCashbox("PATCH", {
    sessionId,
    closingBalance,
    userId: user.id,
  });
}
