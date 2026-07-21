import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  verifyAuthSessionCookie,
} from "@/lib/auth/session-cookie";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

const registrationSelectColumns =
  "id,created_at,full_name,document_number,phone,email,grade_course,student_name,attendees,tables,notes,source";

async function getDashboardSession() {
  const cookieStore = await cookies();
  return verifyAuthSessionCookie(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
}

export async function GET() {
  try {
    const session = await getDashboardSession();

    if (!session?.user) {
      return NextResponse.json(
        { message: "Se requiere iniciar sesion para consultar registros." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!session.user.permissions.includes("users")) {
      return NextResponse.json(
        { message: "No tiene permiso para consultar registros del bingo." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { supabaseUrl } = getSupabaseEnv();
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const url = new URL(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/bingo_registrations`,
    );
    url.searchParams.set("select", registrationSelectColumns);
    url.searchParams.set("order", "created_at.desc");

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
        { message: responseText || "No se pudieron consultar los registros." },
        {
          status: response.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      { registrations: responseText ? JSON.parse(responseText) : [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudieron consultar los registros.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
