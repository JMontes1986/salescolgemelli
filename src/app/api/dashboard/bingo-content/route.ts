import { NextResponse } from "next/server";
import { defaultBingoContent, type BingoLandingContent } from "@/lib/bingo-data";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

async function requestSupabase(method: "GET" | "POST", body?: unknown) {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/bingo_landing_content${method === "GET" ? "?id=eq.default&select=content" : "?on_conflict=id"}`;

  return fetch(url, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(method === "POST" ? { Prefer: "resolution=merge-duplicates,return=representation" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

export async function GET() {
  try {
    const response = await requestSupabase("GET");
    if (!response.ok) {
      return NextResponse.json({ content: defaultBingoContent, source: "default" }, { headers: { "Cache-Control": "no-store" } });
    }
    const rows = (await response.json()) as { content?: BingoLandingContent }[];
    return NextResponse.json({ content: rows[0]?.content ?? defaultBingoContent, source: rows[0]?.content ? "database" : "default" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No se pudo cargar el contenido." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { content?: unknown };
    if (!body.content || typeof body.content !== "object" || Array.isArray(body.content)) {
      return NextResponse.json({ message: "El contenido debe ser un objeto JSON valido." }, { status: 400 });
    }
    const response = await requestSupabase("POST", { id: "default", content: body.content, updated_at: new Date().toISOString() });
    const text = await response.text();
    if (!response.ok) return NextResponse.json({ message: text || "No se pudo guardar el contenido." }, { status: response.status });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No se pudo guardar el contenido." }, { status: 500 });
  }
}
