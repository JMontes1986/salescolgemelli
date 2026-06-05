import { insertRow, selectRows } from "@/lib/supabase";
import type { Return, NewReturn } from "@/lib/types";
import { increaseProductStock } from "./product-service";

export async function getReturns(): Promise<Return[]> {
  return selectRows<Return>('returns', { order: 'returnedAt.desc' });
}

export async function addReturnAndUpdateStock(returnRecord: NewReturn): Promise<Return> {
  await increaseProductStock(returnRecord.productId, returnRecord.quantity);
  return insertRow<Return>('returns', returnRecord);
}
