import { cookies } from "next/headers";
import { z } from "zod";
import type { PaymentTransaction } from "@/lib/types";
import { AUTH_SESSION_COOKIE, verifyAuthSessionCookie } from "@/lib/auth/session-cookie";
import { serviceRpc, serviceSelect } from "@/lib/server/supabase-service";
import { hasValidJsonRequest, noStoreJson } from "@/lib/server/self-service-request";

async function authorizedUser() {
  const session = await verifyAuthSessionCookie((await cookies()).get(AUTH_SESSION_COOKIE)?.value);
  const user = session?.user;
  return user && (user.role === "admin" || user.role === "cashier" || user.permissions.includes("cashbox")) ? user : null;
}

export async function GET() {
  if (!await authorizedUser()) return noStoreJson({ message: "No tiene permiso para verificar pagos." }, 403);
  const payments = await serviceSelect<PaymentTransaction>("payment_transactions", {
    select: '*,purchase:purchases!payment_transactions_purchase_id_fkey(id,date,total,items,celular,status)',
    provider: "eq.breb", status: "eq.reported", order: "reported_at.asc",
  });
  return noStoreJson({ payments });
}

const schema = z.object({ paymentId: z.string().uuid(), action: z.enum(["verify", "reject"]) }).strict();
export async function PATCH(request: Request) {
  if (!hasValidJsonRequest(request)) return noStoreJson({ message: "Solicitud no permitida." }, 415);
  const user = await authorizedUser();
  if (!user) return noStoreJson({ message: "No tiene permiso para verificar pagos." }, 403);
  try {
    const input = schema.parse(await request.json());
    const payment = await serviceRpc<PaymentTransaction>(input.action === "verify" ? "verify_breb_payment" : "reject_breb_payment", {
      p_payment_id: input.paymentId, p_user_id: user.id, p_user_name: user.name,
    });
    return noStoreJson({ payment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo actualizar el pago.";
    return noStoreJson({ message }, 400);
  }
}
