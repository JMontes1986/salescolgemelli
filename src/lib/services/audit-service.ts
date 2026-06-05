import { insertRow, selectRows } from "@/lib/supabase";
import type { AuditLog, NewAuditLog } from "@/lib/types";

export async function getAuditLogs(): Promise<AuditLog[]> {
  return selectRows<AuditLog>('auditLogs', { order: 'timestamp.desc' });
}

export async function addAuditLog(logRecord: NewAuditLog): Promise<AuditLog> {
  const timestamp = new Date().toISOString();
  return insertRow<AuditLog>('auditLogs', { ...logRecord, timestamp });
}
