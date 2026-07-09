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

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const session = await verifyAuthSessionCookie(
      cookieStore.get(AUTH_SESSION_COOKIE)?.value,
    );

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
