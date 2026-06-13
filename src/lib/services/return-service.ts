import { insertRow, selectRows } from "@/lib/supabase";
import type { Return, NewReturn } from "@/lib/types";
import { increaseProductStock } from "./product-service";
import { addAuditLog } from "./audit-service";

export async function getReturns(): Promise<Return[]> {
  return selectRows<Return>('returns', { order: 'returnedAt.desc' });
}

export async function addReturnAndUpdateStock(returnRecord: NewReturn): Promise<Return> {
  await increaseProductStock(returnRecord.productId, returnRecord.quantity);
  const savedReturn = await insertRow<Return>('returns', returnRecord);

  await addAuditLog({
    userId: savedReturn.processedByUserId,
    userName: savedReturn.processedByUserName,
    action: 'RETURN_PROCESS',
    details: `Devolución registrada para '${savedReturn.productName}'. Cantidad: ${savedReturn.quantity}. Origen: ${savedReturn.source}.`,
  });

  return savedReturn;
}
