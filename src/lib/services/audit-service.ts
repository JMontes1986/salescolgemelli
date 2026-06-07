import { insertRow, selectRows } from "@/lib/supabase";
import type { AuditLog, NewAuditLog } from "@/lib/types";

function clientAuditLogsEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_CLIENT_AUDIT_LOGS === 'true';
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  if (!clientAuditLogsEnabled()) {
    return [];
  }

  try {
    return await selectRows<AuditLog>('auditLogs', { order: 'timestamp.desc' });
  } catch (error) {
    console.warn("No se pudieron cargar los logs de auditoría.", error);
    return [];
  }
}

export async function addAuditLog(logRecord: NewAuditLog): Promise<AuditLog> {
  const timestamp = new Date().toISOString();

  if (!clientAuditLogsEnabled()) {
    return {
      id: `local-${timestamp}`,
      ...logRecord,
      timestamp,
    };
  }

  return insertRow<AuditLog>('auditLogs', { ...logRecord, timestamp });
}
