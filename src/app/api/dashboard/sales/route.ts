import { NextResponse } from "next/server";

import { cookies } from 'next/headers';
import type { Purchase } from '@/lib/types';
import {
  AUTH_SESSION_COOKIE,
  verifyAuthSessionCookie,
} from '@/lib/auth/session-cookie';
import { getSupabaseEnv, getSupabaseServiceRoleKey } from '@/lib/supabase';

type SaleItem = { id: string; quantity: number };
type DashboardSaleRequest = {
  items?: unknown;
  cedula?: unknown;
  status?: unknown;
};

const productIdPattern =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const customerIdPattern = /^[0-9A-Za-z.-]{4,30}$/;

function normalizeItems(value: unknown): SaleItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) {
    return null;
  }

  const items = value.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const candidate = item as { id?: unknown; quantity?: unknown };
    const id = String(candidate.id ?? '').trim();
    const quantity = Number(candidate.quantity);
    if (!productIdPattern.test(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return null;
    }
    return { id, quantity };
  });

  return items.every((item): item is SaleItem => item !== null) ? items : null;
}

function getSupabaseErrorMessage(responseText: string) {
  try {
    const parsed = JSON.parse(responseText) as { message?: unknown };
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    // Keep the raw response when Supabase does not return JSON.
  }
  return responseText || 'No se pudo registrar la venta.';
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const session = await verifyAuthSessionCookie(
      cookieStore.get(AUTH_SESSION_COOKIE)?.value,
    );

    if (!session?.user) {
      return NextResponse.json(
        { message: 'Se requiere iniciar sesion para registrar ventas.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (!session.user.permissions.includes('sales')) {
      return NextResponse.json(
        { message: 'No tiene permiso para registrar ventas.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const body = (await request.json()) as DashboardSaleRequest;
    const items = normalizeItems(body.items);
    const cedula = String(body.cedula ?? '').trim();

    if (!items) {
      return NextResponse.json(
        { message: 'Los productos de la venta no son validos.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (cedula && !customerIdPattern.test(cedula)) {
      return NextResponse.json(
        { message: 'La cedula no tiene un formato valido.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const deliveryCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    ).replace(/\/$/, '');
    const { supabaseUrl } = getSupabaseEnv();
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const response = await fetch(
      supabaseUrl.replace(/\/$/, '') +
        '/rest/v1/rpc/create_pos_purchase_with_stock_server',
      {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: 'Bearer ' + serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_items: items,
          p_cedula: cedula,
          p_seller_id: session.user.id,
          p_seller_name: session.user.name,
          p_date: new Date().toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
          }),
          p_status: body.status === 'delivered' ? 'delivered' : 'paid',
          p_delivery_code: deliveryCode,
          p_qr_base_url: appUrl,
        }),
        cache: 'no-store',
      },
    );
    const responseText = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { message: getSupabaseErrorMessage(responseText) },
        {
          status: response.status >= 400 ? response.status : 400,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const purchase = responseText
      ? (JSON.parse(responseText) as Purchase)
      : null;
    if (!purchase) {
      return NextResponse.json(
        { message: 'Supabase no devolvio la venta registrada.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { purchase },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Dashboard POS sale creation failed.', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No se pudo registrar la venta.',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
