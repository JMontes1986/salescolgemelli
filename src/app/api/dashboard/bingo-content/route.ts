import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { defaultBingoContent, type BingoLandingContent } from "@/lib/bingo-data";
import { AUTH_SESSION_COOKIE, verifyAuthSessionCookie } from "@/lib/auth/session-cookie";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

async function isAdminRequest() {
  const cookieStore = await cookies();
  const session = await verifyAuthSessionCookie(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
  return session?.user.role === "admin";
}

function forbiddenResponse() {
  return NextResponse.json(
    { message: "Solo un administrador puede cambiar la configuracion del Bingo." },
    { status: 403 },
  );
}

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
    if (!(await isAdminRequest())) return forbiddenResponse();
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

export async function PATCH(request: Request) {
  try {
    if (!(await isAdminRequest())) return forbiddenResponse();

    const body = (await request.json()) as { selfServiceEnabled?: unknown };
    if (typeof body.selfServiceEnabled !== "boolean") {
      return NextResponse.json(
        { message: "El estado de Autogestion debe ser verdadero o falso." },
        { status: 400 },
      );
    }

    const currentResponse = await requestSupabase("GET");
    if (!currentResponse.ok) {
      return NextResponse.json(
        { message: "No se pudo consultar la configuracion actual." },
        { status: currentResponse.status },
      );
    }

    const rows = (await currentResponse.json()) as { content?: BingoLandingContent }[];
    const currentContent = rows[0]?.content ?? defaultBingoContent;
    const nextContent: BingoLandingContent = {
      ...currentContent,
      selfServiceEnabled: body.selfServiceEnabled,
    };
    const response = await requestSupabase("POST", {
      id: "default",
      content: nextContent,
      updated_at: new Date().toISOString(),
    });
    const text = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { message: text || "No se pudo actualizar Autogestion." },
        { status: response.status },
      );
    }

    return NextResponse.json(
      { ok: true, selfServiceEnabled: nextContent.selfServiceEnabled },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo actualizar Autogestion." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAdminRequest())) return forbiddenResponse();
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
