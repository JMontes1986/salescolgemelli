import { NextResponse } from "next/server";
import { getRequestId, logApiDone, logApiError, logApiStart } from "@/lib/server/observability";
import { getSupabaseEnv } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const route = "/api/health";
  const method = "GET";
  const requestId = getRequestId(request);
  const start = Date.now();

  logApiStart({ route, method, requestId });

  try {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    const status = response.ok || response.status === 404 ? 200 : 503;

    logApiDone({
      route,
      method,
      requestId,
      status,
      ms: Date.now() - start,
      meta: { supabaseStatus: response.status },
    });

    return NextResponse.json(
      {
        ok: status === 200,
        service: "ventas-colgemelli",
        supabaseStatus: response.status,
        timestamp: new Date().toISOString(),
      },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    logApiError({
      route,
      method,
      requestId,
      status: 503,
      ms: Date.now() - start,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        service: "ventas-colgemelli",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
