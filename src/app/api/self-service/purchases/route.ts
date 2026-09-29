import { cookies } from "next/headers";
import { z } from "zod";
import type { Purchase } from "@/lib/types";
import { serviceRpc, serviceSelect } from "@/lib/server/supabase-service";
import { createSelfServiceSession, SELF_SERVICE_SESSION_COOKIE, selfServiceCookieOptions, verifySelfServiceSession } from "@/lib/server/self-service-session";
import { enforceSelfServiceRateLimit, hasValidJsonRequest, noStoreJson } from "@/lib/server/self-service-request";

const itemSchema = z.object({ id: z.string().uuid(), quantity: z.number().int().min(1).max(99) }).strict();
const createSchema = z.object({ items: z.array(itemSchema).min(1).max(30), celular: z.string().trim().regex(/^3\d{9}$/, "Ingrese un celular colombiano válido.") }).strict();
const publicColumns = 'id,date,total,items,status,"reservationExpiresAt","modifiedAt","modificationCount"';

export async function POST(request: Request) {
  if (!hasValidJsonRequest(request)) return noStoreJson({ message: "Solicitud no permitida." }, 415);
  const limited = await enforceSelfServiceRateLimit(request, "purchase-create", 10, 600);
  if (limited) return limited;
  try {
    const raw = await request.text();
    if (raw.length > 16_384) return noStoreJson({ message: "La solicitud es demasiado grande." }, 413);
    const input = createSchema.parse(JSON.parse(raw));
    const purchase = await serviceRpc<Purchase>("create_self_service_purchase_v2", { p_items: input.items, p_celular: input.celular });
    const cookieStore = await cookies();
    const prior = verifySelfServiceSession(cookieStore.get(SELF_SERVICE_SESSION_COOKIE)?.value);
    const token = createSelfServiceSession(input.celular, [...(prior?.purchaseIds ?? []), purchase.id]);
    const response = noStoreJson({ purchase }, 201);
    response.cookies.set(SELF_SERVICE_SESSION_COOKIE, token, selfServiceCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "No se pudo crear la compra.";
    return noStoreJson({ message }, 400);
  }
}

export async function GET(request: Request) {
  const session = verifySelfServiceSession((await cookies()).get(SELF_SERVICE_SESSION_COOKIE)?.value);
  if (!session || session.purchaseIds.length === 0) return noStoreJson({ purchases: [] });
  const limited = await enforceSelfServiceRateLimit(request, "purchase-history", 30, 600, session.subjectHash);
  if (limited) return limited;
  const ids = session.purchaseIds.join(",");
  const purchases = await serviceSelect<Purchase>("purchases", { select: publicColumns, id: `in.(${ids})`, order: "date.desc" });
  return noStoreJson({ purchases });
}
