import { insertRow, selectRows, selectSingle, updateById } from "@/lib/supabase";
import type { CashboxSession, NewCashboxSession, User } from "@/lib/types";
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

  const newSession: NewCashboxSession = {
    userId: user.id,
    userName: user.name,
    status: 'open',
    openingBalance,
    openedAt: new Date().toISOString(),
    totalSales: 0,
  };

  const session = await insertRow<CashboxSession>('cashboxSessions', newSession);

  await addAuditLog({
    userId: user.id,
    userName: user.name,
    action: 'CASHBOX_OPEN',
    details: `Caja abierta con un saldo inicial de ${openingBalance}.`,
  });

  return session;
}

export async function closeCashboxSession(sessionId: string, closingBalance: number, user: User): Promise<void> {
  const session = await selectSingle<CashboxSession>('cashboxSessions', { id: `eq.${sessionId}` });
  if (!session || session.status !== 'open') {
    throw new Error("La sesión no existe o ya ha sido cerrada.");
  }
  if (session.userId !== user.id) {
    throw new Error("No tiene permiso para cerrar esta sesión de caja.");
  }

  await updateById<CashboxSession>('cashboxSessions', sessionId, {
    status: 'closed',
    closingBalance,
    closedAt: new Date().toISOString(),
  });

  await addAuditLog({
    userId: user.id,
    userName: user.name,
    action: 'CASHBOX_CLOSE',
    details: `Caja cerrada con un saldo final de ${closingBalance}.`,
  });
}
