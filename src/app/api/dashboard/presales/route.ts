import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Purchase } from "@/lib/types";
import {
  AUTH_SESSION_COOKIE,
  verifyAuthSessionCookie,
} from "@/lib/auth/session-cookie";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

type DashboardPreSaleRequest = {
  items?: unknown;
  cedula?: unknown;
  celular?: unknown;
};

const purchaseSelectColumns =
  'id,date,total,items,cedula,celular,"sellerId","sellerName",status,"deliveryCode","qrPayload","reservationExpiresAt"';
const customerIdPattern = /^[0-9A-Za-z.-]{4,30}$/;

function userCanReadPreSales(permissions: string[]) {
  return permissions.includes("presale") || permissions.includes("cashbox");
}

async function getDashboardSession() {
  const cookieStore = await cookies();
  return verifyAuthSessionCookie(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
}

async function fetchServerPreSales(cedula?: string) {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/purchases`);

  url.searchParams.set("select", purchaseSelectColumns);
  url.searchParams.set("id", "like.PV%");
  url.searchParams.set("status", "in.(pre-sale,pre-sale-confirmed)");
  url.searchParams.set('"sellerId"', "not.is.null");
  url.searchParams.set("order", "date.desc");

  if (cedula) {
    url.searchParams.set("cedula", `eq.${cedula}`);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const responseText = await response.text();

  if (!response.ok) {
    let message = responseText || "No se pudieron consultar las preventas.";

    try {
      const parsed = JSON.parse(responseText) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        message = parsed.message;
      }
    } catch {
      // Keep the raw response text.
    }

    return { ok: false as const, status: response.status, message };
  }

  return {
    ok: true as const,
    purchases: responseText ? (JSON.parse(responseText) as Purchase[]) : [],
  };
}

async function callServerPreSaleRpc(body: Record<string, unknown>) {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/create_dashboard_presale_purchase_server`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  const responseText = await response.text();

  if (!response.ok) {
    let message = responseText || "No se pudo registrar la preventa.";

    try {
      const parsed = JSON.parse(responseText) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        message = parsed.message;
      }
    } catch {
      // Keep the raw response text.
    }

    return { ok: false as const, status: response.status, message };
  }

  return {
    ok: true as const,
    purchase: responseText ? (JSON.parse(responseText) as Purchase) : null,
  };
}

export async function GET(request: Request) {
  try {
    const session = await getDashboardSession();

    if (!session?.user) {
      return NextResponse.json(
        { message: "Se requiere iniciar sesion para consultar preventas." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!userCanReadPreSales(session.user.permissions)) {
      return NextResponse.json(
        { message: "No tiene permiso para consultar preventas." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const requestUrl = new URL(request.url);
    const cedula = requestUrl.searchParams.get("cedula")?.trim() || undefined;

    if (cedula && !customerIdPattern.test(cedula)) {
      return NextResponse.json(
        { message: "La cedula no tiene un formato valido." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const preSalesResponse = await fetchServerPreSales(cedula);

    if (!preSalesResponse.ok) {
      return NextResponse.json(
        { message: preSalesResponse.message },
        {
          status: preSalesResponse.status >= 400 ? preSalesResponse.status : 400,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      { purchases: preSalesResponse.purchases },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Dashboard pre-sale lookup failed.", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudieron consultar las preventas.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getDashboardSession();

    if (!session?.user) {
      return NextResponse.json(
        { message: "Se requiere iniciar sesion para registrar preventas." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!session.user.permissions.includes("presale")) {
      return NextResponse.json(
        { message: "No tiene permiso para registrar preventas." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = (await request.json()) as DashboardPreSaleRequest;
    const rpcResponse = await callServerPreSaleRpc({
      p_items: body.items,
      p_cedula: body.cedula,
      p_celular: body.celular,
      p_seller_id: session.user.id,
      p_seller_name: session.user.name,
      p_date: new Date().toLocaleString("es-CO", {
        timeZone: "America/Bogota",
      }),
    });

    if (!rpcResponse.ok) {
      return NextResponse.json(
        { message: rpcResponse.message },
        {
          status: rpcResponse.status >= 400 ? rpcResponse.status : 400,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      { purchase: rpcResponse.purchase },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Dashboard pre-sale creation failed.", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo registrar la preventa.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
