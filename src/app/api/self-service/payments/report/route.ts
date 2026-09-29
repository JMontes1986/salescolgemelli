import { cookies } from "next/headers";
import { z } from "zod";
import type { PaymentTransaction } from "@/lib/types";
import { serviceRpc } from "@/lib/server/supabase-service";
import { SELF_SERVICE_SESSION_COOKIE, verifySelfServiceSession } from "@/lib/server/self-service-session";
import { enforceSelfServiceRateLimit, hasValidJsonRequest, noStoreJson } from "@/lib/server/self-service-request";

const schema = z.object({ purchaseId: z.string().regex(/^[0-9A-Za-z_-]{1,80}$/) }).strict();

export async function POST(request: Request) {
  if (!hasValidJsonRequest(request)) return noStoreJson({ message: "Solicitud no permitida." }, 415);
  const session = verifySelfServiceSession((await cookies()).get(SELF_SERVICE_SESSION_COOKIE)?.value);
  if (!session) return noStoreJson({ message: "La sesión expiró. Genere una nueva compra." }, 401);
  const limited = await enforceSelfServiceRateLimit(request, "payment-report", 10, 600, session.subjectHash);
  if (limited) return limited;
  try {
    const input = schema.parse(await request.json());
    if (!session.purchaseIds.includes(input.purchaseId)) return noStoreJson({ message: "Esta compra no pertenece a su sesión." }, 403);
    const configuredMinutes = Number(process.env.BREB_REPORTED_RESERVATION_MINUTES || 1440);
    const payment = await serviceRpc<PaymentTransaction>("report_breb_payment", {
      p_purchase_id: input.purchaseId,
      p_hold_minutes: Number.isFinite(configuredMinutes) ? Math.max(60, Math.min(10080, Math.floor(configuredMinutes))) : 1440,
    });
    return noStoreJson({ payment });
  } catch (error) {
    const message = error instanceof z.ZodError ? "La compra no es válida." : error instanceof Error ? error.message : "No se pudo reportar el pago.";
    return noStoreJson({ message }, 400);
  }
}
