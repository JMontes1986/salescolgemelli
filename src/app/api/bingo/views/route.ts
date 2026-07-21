import { NextResponse } from "next/server";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

async function requestSupabaseViews(method: "GET" | "POST" | "PATCH", body?: unknown) {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/bingo_landing_views`);
  url.searchParams.set("id", "eq.default");
  url.searchParams.set("select", "id,total_views,updated_at");

  return fetch(url.toString(), {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

export async function POST() {
  try {
    const currentResponse = await requestSupabaseViews("GET");
    const currentText = await currentResponse.text();

    if (!currentResponse.ok) {
      return NextResponse.json(
        { message: currentText || "No se pudo consultar el contador de visitas." },
        { status: currentResponse.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    const currentRows = currentText
      ? (JSON.parse(currentText) as Array<{ total_views?: number }>)
      : [];
    const currentViews = Number(currentRows[0]?.total_views ?? 0);

    const response =
      currentRows.length > 0
        ? await requestSupabaseViews("PATCH", {
            total_views: currentViews + 1,
            updated_at: new Date().toISOString(),
          })
        : await fetch(`${getSupabaseEnv().supabaseUrl.replace(/\/$/, "")}/rest/v1/bingo_landing_views`, {
            method: "POST",
            headers: {
              apikey: getSupabaseServiceRoleKey(),
              Authorization: `Bearer ${getSupabaseServiceRoleKey()}`,
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              id: "default",
              total_views: 1,
              updated_at: new Date().toISOString(),
            }),
            cache: "no-store",
          });

    const responseText = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { message: responseText || "No se pudo registrar la visita." },
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    const rows = responseText
      ? (JSON.parse(responseText) as Array<{ total_views?: number }>)
      : [];

    return NextResponse.json(
      { totalViews: Number(rows[0]?.total_views ?? currentViews + 1) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo registrar la visita.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
