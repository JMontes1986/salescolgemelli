import { callRpc, selectRows, selectSingle } from "@/lib/supabase";
import type { CashboxSession, User } from "@/lib/types";
import { addAuditLog } from "./audit-service";

export async function getActiveSessionForUser(userId: string): Promise<CashboxSession | null> {
  return selectSingle<CashboxSession>('cashboxSessions', {
    userId: `eq.${userId}`,
    status: 'eq.open',
  });
}

export async function getCashboxHistory(): Promise<CashboxSession[]> {
  return selectRows<CashboxSession>('cashboxSessions', { order: 'openedAt.desc' });
}

export async function openCashboxSession(openingBalance: number, user: User): Promise<CashboxSession> {
  const activeSession = await getActiveSessionForUser(user.id);
  if (activeSession) {
    throw new Error("Ya existe una sesión de caja abierta para este usuario.");
  }

  const session = await callRpc<CashboxSession>('open_cashbox_session', {
    p_opening_balance: openingBalance,
    p_user_name: user.name,
  });

  await addAuditLog({
    userId: user.id,
    userName: user.name,
    action: 'CASHBOX_OPEN',
    details: `Caja abierta con un saldo inicial de ${openingBalance}.`,
  });

  return session;
}

export async function closeCashboxSession(sessionId: string, closingBalance: number, user: User): Promise<void> {
  await callRpc<CashboxSession>('close_cashbox_session', {
    p_session_id: sessionId,
    p_closing_balance: closingBalance,
  });

  await addAuditLog({
    userId: user.id,
    userName: user.name,
    action: 'CASHBOX_CLOSE',
    details: `Caja cerrada con un saldo final de ${closingBalance}.`,
  });
}
