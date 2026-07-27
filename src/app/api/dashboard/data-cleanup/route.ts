import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  verifyAuthSessionCookie,
} from "@/lib/auth/session-cookie";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

const cleanupEntities = ["purchase", "return", "cashbox", "bingo", "audit"] as const;
type CleanupEntity = (typeof cleanupEntities)[number];

type CleanupRow = Record<string, unknown>;

type DeleteRequest = {
  entity?: unknown;
  id?: unknown;
  confirmation?: unknown;
};

const entityQueries: Record<
  CleanupEntity,
  { table: string; select: string; order: string }
> = {
  purchase: {
    table: "purchases",
    select: 'id,date,total,items,cedula,celular,"sellerId","sellerName",status',
    order: "date.desc",
  },
  return: {
    table: "returns",
    select: 'id,"productName",quantity,"returnedAt","processedByUserName",source',
    order: "returnedAt.desc",
  },
  cashbox: {
    table: "cashboxSessions",
    select: 'id,"userName",status,"openingBalance","closingBalance","openedAt","closedAt","totalSales"',
    order: "openedAt.desc",
  },
  bingo: {
    table: "bingo_registrations",
    select: "id,created_at,full_name,document_number,phone,grade_course,student_name,attendees,tables",
    order: "created_at.desc",
  },
  audit: {
    table: "auditLogs",
    select: 'id,timestamp,"userName",action,details',
    order: "timestamp.desc",
  },
};

function isCleanupEntity(value: unknown): value is CleanupEntity {
  return typeof value === "string" && cleanupEntities.includes(value as CleanupEntity);
}

async function getAdminSession() {
  const cookieStore = await cookies();
  const session = await verifyAuthSessionCookie(
    cookieStore.get(AUTH_SESSION_COOKIE)?.value,
  );
  return session?.user.role === "admin" ? session : null;
}

function serviceHeaders(prefer?: string) {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function restUrl(path: string) {
  const { supabaseUrl } = getSupabaseEnv();
  return new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`);
}

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        throw new Error(parsed.message);
      }
    } catch (error) {
      if (error instanceof Error && error.message !== "Unexpected end of JSON input") {
        throw error;
      }
    }
    throw new Error(text || fallback);
  }
  return (text ? JSON.parse(text) : null) as T;
}

function textValue(row: CleanupRow, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function numberValue(row: CleanupRow, key: string) {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : 0;
}

function mapRow(entity: CleanupEntity, row: CleanupRow) {
  const id = String(row.id ?? "");

  if (entity === "purchase") {
    const items = Array.isArray(row.items) ? row.items : [];
    const units = items.reduce((total, item) => {
      if (!item || typeof item !== "object") return total;
      return total + Number((item as { quantity?: unknown }).quantity ?? 0);
    }, 0);
    const channel = id.startsWith("CG")
      ? "Venta POS"
      : row.sellerId
        ? "Preventa"
        : "Autogestión";
    return {
      id,
      title: `${channel} · ${id}`,
      subtitle: `Cliente ${textValue(row, "cedula") || "N/A"} · ${units} unidad(es)`,
      date: textValue(row, "date"),
      amount: numberValue(row, "total"),
      badge: textValue(row, "status"),
      searchText: `${id} ${row.cedula ?? ""} ${row.celular ?? ""} ${row.sellerName ?? ""}`,
    };
  }

  if (entity === "return") {
    return {
      id,
      title: `Devolución · ${textValue(row, "productName")}`,
      subtitle: `${numberValue(row, "quantity")} unidad(es) · ${textValue(row, "source")}`,
      date: textValue(row, "returnedAt"),
      badge: textValue(row, "processedByUserName"),
      searchText: `${id} ${row.productName ?? ""} ${row.processedByUserName ?? ""}`,
    };
  }

  if (entity === "cashbox") {
    return {
      id,
      title: `Caja · ${textValue(row, "userName")}`,
      subtitle: `Apertura $${numberValue(row, "openingBalance").toLocaleString("es-CO")} · Ventas $${numberValue(row, "totalSales").toLocaleString("es-CO")}`,
      date: textValue(row, "openedAt"),
      badge: textValue(row, "status"),
      searchText: `${id} ${row.userName ?? ""} ${row.status ?? ""}`,
    };
  }

  if (entity === "bingo") {
    return {
      id,
      title: `Bingo · ${textValue(row, "full_name")}`,
      subtitle: `${textValue(row, "student_name")} · ${textValue(row, "grade_course")} · ${numberValue(row, "tables")} mesa(s)`,
      date: textValue(row, "created_at"),
      badge: textValue(row, "document_number"),
      searchText: `${id} ${row.full_name ?? ""} ${row.document_number ?? ""} ${row.student_name ?? ""}`,
    };
  }

  return {
    id,
    title: textValue(row, "action") || "Evento de auditoría",
    subtitle: textValue(row, "details"),
    date: textValue(row, "timestamp"),
    badge: textValue(row, "userName"),
    searchText: `${id} ${row.action ?? ""} ${row.userName ?? ""} ${row.details ?? ""}`,
  };
}

export async function GET(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json(
        { message: "Solo un administrador puede usar la limpieza de pruebas." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const entityValue = new URL(request.url).searchParams.get("entity");
    if (!isCleanupEntity(entityValue)) {
      return NextResponse.json(
        { message: "Tipo de registro no válido." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const config = entityQueries[entityValue];
    const url = restUrl(config.table);
    url.searchParams.set("select", config.select);
    url.searchParams.set("order", config.order);
    url.searchParams.set("limit", "250");

    const response = await fetch(url, {
      headers: serviceHeaders(),
      cache: "no-store",
    });
    const rows = await readResponse<CleanupRow[]>(
      response,
      "No se pudieron consultar los registros.",
    );

    return NextResponse.json(
      { records: rows.map((row) => mapRow(entityValue, row)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudieron consultar los registros." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json(
        { message: "Solo un administrador puede eliminar datos de prueba." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = (await request.json()) as DeleteRequest;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const confirmation =
      typeof body.confirmation === "string" ? body.confirmation.trim() : "";

    if (!isCleanupEntity(body.entity) || !id || id.length > 100) {
      return NextResponse.json(
        { message: "La solicitud de eliminación no es válida." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (confirmation !== id) {
      return NextResponse.json(
        { message: "La confirmación no coincide con el identificador." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const url = restUrl("rpc/admin_delete_test_record");
    const response = await fetch(url, {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({
        p_entity: body.entity,
        p_record_id: id,
        p_user_id: session.user.id,
        p_user_name: session.user.name,
      }),
      cache: "no-store",
    });
    const result = await readResponse<Record<string, unknown>>(
      response,
      "No se pudo eliminar el registro.",
    );

    return NextResponse.json(
      { result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo eliminar el registro." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
