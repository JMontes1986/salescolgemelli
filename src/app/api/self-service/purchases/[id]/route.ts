import { cookies } from "next/headers";
import { z } from "zod";
import type { Purchase } from "@/lib/types";
import { serviceRpc } from "@/lib/server/supabase-service";
import { SELF_SERVICE_SESSION_COOKIE, verifySelfServiceSession } from "@/lib/server/self-service-session";
import { enforceSelfServiceRateLimit, hasValidJsonRequest, noStoreJson } from "@/lib/server/self-service-request";

const schema = z.object({ items: z.array(z.object({ id: z.string().uuid(), quantity: z.number().int().min(1).max(99) }).strict()).min(1).max(30) }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasValidJsonRequest(request)) return noStoreJson({ message: "Solicitud no permitida." }, 415);
  const { id } = await params;
  const session = verifySelfServiceSession((await cookies()).get(SELF_SERVICE_SESSION_COOKIE)?.value);
  if (!session || !session.purchaseIds.includes(id)) return noStoreJson({ message: "No está autorizado para modificar esta compra." }, 403);
  const limited = await enforceSelfServiceRateLimit(request, "purchase-edit", 10, 600, session.subjectHash);
  if (limited) return limited;
  try {
    const input = schema.parse(await request.json());
    const purchase = await serviceRpc<Purchase>("update_self_service_pending_purchase_v2", { p_purchase_id: id, p_items: input.items });
    return noStoreJson({ purchase });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "No se pudo modificar la compra.";
    return noStoreJson({ message }, 400);
  }
}
