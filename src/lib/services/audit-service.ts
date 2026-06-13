import { insertRow, selectRows } from "@/lib/supabase";
import type { AuditLog, NewAuditLog } from "@/lib/types";

function clientAuditLogWritesEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_CLIENT_AUDIT_LOGS === 'true';
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  return selectRows<AuditLog>('auditLogs', { order: 'timestamp.desc' });
}

export async function addAuditLog(logRecord: NewAuditLog): Promise<AuditLog> {
  const timestamp = new Date().toISOString();

  if (!clientAuditLogWritesEnabled()) {
    return {
      id: `local-${timestamp}`,
      ...logRecord,
      timestamp,
    };
  }

  return insertRow<AuditLog>('auditLogs', { ...logRecord, timestamp });
}
