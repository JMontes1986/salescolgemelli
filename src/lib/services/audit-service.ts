import { callRpc, insertRow, selectRows } from "@/lib/supabase";
import type { AuditLog, NewAuditLog } from "@/lib/types";

export async function getAuditLogs(): Promise<AuditLog[]> {
  return selectRows<AuditLog>('auditLogs', { order: 'timestamp.desc' });
}

export async function addAuditLog(logRecord: NewAuditLog): Promise<AuditLog> {
  const timestamp = new Date().toISOString();

  try {
    return await callRpc<AuditLog>('record_audit_log', {
      p_user_id: logRecord.userId,
      p_user_name: logRecord.userName,
      p_action: logRecord.action,
      p_details: logRecord.details,
    });
  } catch (rpcError) {
    try {
      return await insertRow<AuditLog>('auditLogs', { ...logRecord, timestamp });
    } catch (insertError) {
      console.warn("No se pudo registrar auditoría.", rpcError, insertError);
      return {
        id: `local-${timestamp}`,
        ...logRecord,
        timestamp,
      };
    }
  }
}
