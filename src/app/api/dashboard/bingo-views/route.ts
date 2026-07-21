import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  verifyAuthSessionCookie,
} from "@/lib/auth/session-cookie";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

async function getDashboardSession() {
  const cookieStore = await cookies();
  return verifyAuthSessionCookie(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
}

export async function GET() {
  try {
    const session = await getDashboardSession();

    if (!session?.user) {
      return NextResponse.json(
        { message: "Se requiere iniciar sesion para consultar visitas." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!session.user.permissions.includes("users")) {
      return NextResponse.json(
        { message: "No tiene permiso para consultar visitas del bingo." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { supabaseUrl } = getSupabaseEnv();
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/bingo_landing_views`);
    url.searchParams.set("id", "eq.default");
    url.searchParams.set("select", "total_views,updated_at");
    url.searchParams.set("limit", "1");

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
      return NextResponse.json(
        { message: responseText || "No se pudo consultar el contador de visitas." },
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    const rows = responseText
      ? (JSON.parse(responseText) as Array<{ total_views?: number; updated_at?: string }>)
      : [];

    return NextResponse.json(
      {
        totalViews: Number(rows[0]?.total_views ?? 0),
        updatedAt: rows[0]?.updated_at ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo consultar el contador de visitas.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
