import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  verifyAuthSessionCookie,
} from "@/lib/auth/session-cookie";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

const customerIdPattern = /^[0-9A-Za-z.-]{4,30}$/;
const purchaseSelectColumns = 'id,date,total,items,cedula,celular,"sellerId","sellerName",status,"deliveryCode","qrPayload","reservationExpiresAt"';

type DeleteHistoryRequest = {
  cedula?: unknown;
};

async function getDashboardSession() {
  const cookieStore = await cookies();
  return verifyAuthSessionCookie(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
}

async function fetchServiceRole(url: URL, init: RequestInit = {}) {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  return fetch(url.toString(), {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

async function parseErrorMessage(responseText: string, fallback: string) {
  let message = responseText || fallback;

  try {
    const parsed = JSON.parse(responseText) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      message = parsed.message;
    }
  } catch {
    // Keep raw response text.
  }

  return message;
}

async function recordAuditLog(userId: string, userName: string, cedula: string, deletedCount: number) {
  const { supabaseUrl } = getSupabaseEnv();
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/auditLogs`);

  await fetchServiceRole(url, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      userId,
      userName,
      action: "TICKET_VOID",
      details: `Administrador eliminó ${deletedCount} compra(s) del historial PV/autogestión de la cédula ${cedula}.`,
    }),
  }).catch((error) => {
    console.warn("No se pudo registrar auditoría de eliminación de historial de autogestión.", error);
  });
}

export async function DELETE(request: Request) {
  const session = await getDashboardSession();

  if (!session?.user) {
    return NextResponse.json(
      { message: "Debe iniciar sesión para eliminar historiales." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (session.user.role !== "admin") {
    return NextResponse.json(
      { message: "Solo un administrador puede eliminar historiales de autogestión." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: DeleteHistoryRequest;
  try {
    body = await request.json() as DeleteHistoryRequest;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cedula = typeof body.cedula === "string" ? body.cedula.trim() : "";

  if (!customerIdPattern.test(cedula)) {
    return NextResponse.json(
      { message: "La cédula no tiene un formato válido." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { supabaseUrl } = getSupabaseEnv();
  const baseUrl = supabaseUrl.replace(/\/$/, "");
  const lookupUrl = new URL(`${baseUrl}/rest/v1/purchases`);
  lookupUrl.searchParams.set("select", purchaseSelectColumns);
  lookupUrl.searchParams.set("cedula", `eq.${cedula}`);
  lookupUrl.searchParams.set("id", "like.PV%");

  const lookupResponse = await fetchServiceRole(lookupUrl, { method: "GET" });
  const lookupText = await lookupResponse.text();

  if (!lookupResponse.ok) {
    const message = await parseErrorMessage(lookupText, "No se pudo consultar el historial de autogestión.");
    return NextResponse.json(
      { message },
      { status: lookupResponse.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const purchases = lookupText ? JSON.parse(lookupText) as Array<{ id?: unknown }> : [];
  const purchaseIds = purchases
    .filter((purchase) => typeof purchase.id === "string")
    .map((purchase) => purchase.id as string);

  if (purchaseIds.length === 0) {
    return NextResponse.json(
      { deletedCount: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const deleteUrl = new URL(`${baseUrl}/rest/v1/purchases`);
  deleteUrl.searchParams.set("select", purchaseSelectColumns);
  deleteUrl.searchParams.set("id", `in.(${purchaseIds.join(",")})`);

  const response = await fetchServiceRole(deleteUrl, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  const responseText = await response.text();

  if (!response.ok) {
    const message = await parseErrorMessage(responseText, "No se pudo eliminar el historial de autogestión.");
    return NextResponse.json(
      { message },
      { status: response.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const deletedPurchases = responseText ? JSON.parse(responseText) as unknown[] : [];
  const deletedCount = deletedPurchases.length;

  if (deletedCount > 0) {
    await recordAuditLog(session.user.id, session.user.name, cedula, deletedCount);
  }

  return NextResponse.json(
    { deletedCount },
    { headers: { "Cache-Control": "no-store" } },
  );
}