import { callRpc, insertRow, insertRowMinimal, selectRows, selectSingle, updateById } from "@/lib/supabase";
import type { Purchase, NewPurchase, Product, CartItem, User, ProductAvailability } from "@/lib/types";
import { addAuditLog } from "./audit-service";
import { normalizeProductAvailability } from "./product-service";
import { createSelfServiceEditAuditDetails } from "@/lib/self-service-edit-audit";

export type { NewPurchase } from "@/lib/types";

const MAX_DISTINCT_ITEMS_PER_PURCHASE = 30;
const MAX_QUANTITY_PER_ITEM = 99;
const SELF_SERVICE_RESERVATIONS_CACHE_TTL_MS = 8_000;
const recordIdPattern = /^[0-9A-Za-z_-]{1,80}$/;
const customerIdPattern = /^[0-9A-Za-z.-]{4,30}$/;
const colombianPhonePattern = /^[0-9+()\s-]{7,20}$/;
const signedQrTokenPattern = /^[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{32,}$/;

type PurchaseCartInput = Pick<CartItem, 'id' | 'quantity'> & Partial<Pick<CartItem, 'name' | 'price'>>;

type UpdatePendingPurchaseOptions = {
  customerCedula?: string;
  customerCelular?: string;
  selfServiceOnly?: boolean;
};

function sortByNewest(purchases: Purchase[]) {
  return purchases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function normalizeDeliveredQuantity(item: CartItem) {
  const deliveredQuantity = Number(item.deliveredQuantity ?? 0);
  if (!Number.isFinite(deliveredQuantity)) return 0;
  return Math.min(Math.max(Math.trunc(deliveredQuantity), 0), item.quantity);
}

function ensureReturnedFlags(purchase: Purchase): Purchase {
  return {
    ...purchase,
    items: purchase.items.map((item: CartItem) => ({
      ...item,
      returned: item.returned || false,
      deliveredQuantity: normalizeDeliveredQuantity(item),
    })),
  };
}

function generateDeliveryCode() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function buildDeliveryQrPayload(purchaseId: string, deliveryCode: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';
  const path = `/dashboard/redeem?code=${encodeURIComponent(purchaseId)}&delivery=${encodeURIComponent(deliveryCode)}`;
  return baseUrl ? `${baseUrl}${path}` : path;
}

function withDeliveryAccess(purchase: Purchase): Purchase {
  const deliveryCode = purchase.deliveryCode || generateDeliveryCode();
  return {
    ...purchase,
    deliveryCode,
    qrPayload: purchase.qrPayload || buildDeliveryQrPayload(purchase.id, deliveryCode),
  };
}

const purchaseSelectColumns = 'id,date,total,items,cedula,celular,"sellerId","sellerName",status,"deliveryCode","qrPayload","reservationExpiresAt","modifiedAt","modificationCount"';

export function getSelfServiceReservedQuantities(purchases: Purchase[]): Record<string, number> {
  return purchases
    .filter(purchase => !purchase.sellerId && (purchase.status === 'pending' || purchase.status === 'partially-delivered'))
    .reduce<Record<string, number>>((acc, purchase) => {
      purchase.items.forEach((item) => {
        const pendingQuantity = Math.max(item.quantity - normalizeDeliveredQuantity(item), 0);
        acc[item.id] = (acc[item.id] || 0) + pendingQuantity;
      });
      return acc;
    }, {});
}

export const getSelfServicePendingQuantities = getSelfServiceReservedQuantities;

function isDashboardPreSale(purchase: Purchase) {
  return Boolean(purchase.sellerId) && (purchase.status === 'pre-sale' || purchase.status === 'pre-sale-confirmed');
}


async function getNextCounter(counterId: string): Promise<number> {
  try {
    return await callRpc<number>('next_counter', { counter_id: counterId });
  } catch (error) {
    if (error instanceof Error && error.message.includes('next_counter')) {
      throw new Error('Falta actualizar Supabase. Ejecuta el SQL nuevo de supabase/schema.sql para habilitar la generación de códigos.');
    }

    throw error;
  }
}

async function getProductsByIds(ids: string[]): Promise<Map<string, Product>> {
  if (ids.length === 0) return new Map();
  const uniqueIds = [...new Set(ids.map(id => sanitizeRecordId(id, 'El producto')))];
  const products = await selectRows<Product>('products', { id: `in.(${uniqueIds.join(',')})` });
  return new Map(products.map(product => [product.id, product]));
}

async function patchProduct(productId: string, patch: Partial<Product>) {
  const safeProductId = sanitizeRecordId(productId, 'El producto');
  const updatedProduct = await updateById<Product>('products', safeProductId, patch);

  if (!updatedProduct) {
    throw new Error(`No se pudo actualizar el stock del producto ${safeProductId}. Revisa permisos/RLS de la tabla products.`);
  }
}

function sanitizeRecordId(value: string, fieldName: string) {
  const normalized = String(value ?? '').trim();

  if (!recordIdPattern.test(normalized)) {
    throw new Error(`${fieldName} tiene un identificador inválido.`);
  }

  return normalized;
}

function sanitizeSignedQrToken(value: string) {
  const normalized = String(value ?? '').trim();

  if (!signedQrTokenPattern.test(normalized)) {
    throw new Error('El QR firmado no tiene un formato válido.');
  }

  return normalized;
}

export function sanitizeCustomerIdentifier(value: string, fieldName: string) {
  const normalized = String(value ?? '').trim();

  if (!customerIdPattern.test(normalized)) {
    throw new Error(`${fieldName} no tiene un formato válido.`);
  }

  return normalized;
}

export function sanitizeCustomerPhone(value: string) {
  const normalized = value.trim();

  if (!colombianPhonePattern.test(normalized)) {
    throw new Error('El celular no tiene un formato válido.');
  }

  return normalized;
}

function normalizeCartInput(items: PurchaseCartInput[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Debe seleccionar al menos un producto.');
  }

  const itemMap = new Map<string, number>();

  items.forEach((item) => {
    const id = String(item.id ?? '').trim();
    const quantity = Number(item.quantity);

    if (!id) {
      throw new Error('La compra contiene un producto inválido.');
    }

    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
      throw new Error('La compra contiene una cantidad inválida.');
    }

    itemMap.set(id, (itemMap.get(id) ?? 0) + quantity);
  });

  if (itemMap.size > MAX_DISTINCT_ITEMS_PER_PURCHASE) {
    throw new Error(`No se pueden incluir más de ${MAX_DISTINCT_ITEMS_PER_PURCHASE} productos diferentes en una compra.`);
  }

  return [...itemMap.entries()].map(([id, quantity]) => ({ id, quantity }));
}

async function buildVerifiedCartItems(
  items: PurchaseCartInput[],
  requiredAvailability?: ProductAvailability
) {
  const normalizedItems = normalizeCartInput(items);
  const productMap = await getProductsByIds(normalizedItems.map(item => item.id));

  const verifiedItems = normalizedItems.map((item) => {
    const product = productMap.get(item.id);

    if (!product) {
      throw new Error(`Producto con ID ${item.id} no encontrado.`);
    }

    const productAvailability = normalizeProductAvailability(product.availability);
    if (requiredAvailability && !productAvailability.includes(requiredAvailability)) {
      throw new Error(`${product.name} no está disponible para este canal de venta.`);
    }

    if (product.price < 0) {
      throw new Error(`${product.name} tiene un precio inválido.`);
    }

    return {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      quantity: item.quantity,
    };
  });

  return {
    items: verifiedItems,
    productMap,
    total: verifiedItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
  };
}

function assertAvailableStock(
  items: Pick<CartItem, 'id' | 'quantity'>[],
  productMap: Map<string, Product>,
  reservedQuantities: Record<string, number> = {}
) {
  for (const item of items) {
    const product = productMap.get(item.id);
    if (!product) throw new Error(`Producto con ID ${item.id} no encontrado.`);

    const availableStock = product.stock - (reservedQuantities[item.id] || 0);
    if (availableStock < item.quantity) {
      throw new Error(`Stock insuficiente para ${product.name}.`);
    }
  }
}

async function getSelfServiceReservations(excludePurchaseId?: string) {
  return getSelfServiceReservedQuantityMap(excludePurchaseId);
}

async function createDashboardPreSalePurchase(payload: {
  items: PurchaseCartInput[];
  cedula: string;
  celular: string;
}): Promise<Purchase> {
  const response = await fetch('/api/dashboard/presales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });

  const responseBody = await response.json().catch(() => null) as {
    purchase?: Purchase;
    message?: string;
  } | null;

  if (!response.ok) {
    throw new Error(responseBody?.message || 'No se pudo registrar la preventa.');
  }

  if (!responseBody?.purchase) {
    throw new Error('No se recibio la preventa registrada desde el servidor.');
  }

  return responseBody.purchase;
}

async function fetchDashboardPreSales(cedula?: string): Promise<Purchase[]> {
  const url = new URL('/api/dashboard/presales', window.location.origin);

  if (cedula) {
    url.searchParams.set('cedula', cedula);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  const responseBody = await response.json().catch(() => null) as {
    purchases?: Purchase[];
    message?: string;
  } | null;

  if (!response.ok) {
    throw new Error(responseBody?.message || 'No se pudieron consultar las preventas.');
  }

  return responseBody?.purchases ?? [];
}

export async function getSelfServiceReservedQuantityMap(excludePurchaseId?: string, cacheTtlMs = SELF_SERVICE_RESERVATIONS_CACHE_TTL_MS): Promise<Record<string, number>> {
  const safeExcludePurchaseId = excludePurchaseId
    ? sanitizeRecordId(excludePurchaseId, 'La compra')
    : null;

  try {
    const reservedQuantities = await callRpc<Record<string, number>>('get_self_service_reserved_quantities', {
      p_exclude_purchase_id: safeExcludePurchaseId,
    }, cacheTtlMs);
    return reservedQuantities ?? {};
  } catch (error) {
    if (error instanceof Error && error.message.includes('get_self_service_reserved_quantities')) {
      throw new Error('Falta actualizar Supabase. Ejecuta el SQL nuevo de supabase/schema.sql para calcular reservas de autogestión.');
    }

    throw error;
  }
}

function getCurrentDateLabel() {
  return new Date().toLocaleString('es-CO');
}

function countPurchaseUnits(items: Pick<CartItem, 'quantity'>[]) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export async function getPurchases(idPrefix?: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', idPrefix ? { id: `like.${idPrefix}%` } : {});
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function getRecentPreSales(): Promise<Purchase[]> {
  const purchases = await getDashboardPreSales();
  return purchases.slice(0, 5);
}

export async function getSelfServicePurchases(limit = 30): Promise<Purchase[]> {
  const purchases = await getPurchases("PV");
  return purchases
    .filter(purchase => !purchase.sellerId)
    .slice(0, limit);
}

export async function getSelfServicePendingPurchases(limit = 100): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', {
    select: purchaseSelectColumns,
    status: 'in.(pending,pre-sale,partially-delivered)',
    '"sellerId"': 'is.null',
    order: 'date.desc',
    limit,
  });

  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function getPurchaseById(id: string): Promise<Purchase | null> {
  const purchase = await selectSingle<Purchase>('purchases', { id: `eq.${sanitizeRecordId(id, 'La compra')}` });
  return purchase ? ensureReturnedFlags(purchase) : null;
}

export async function getPurchaseByDeliveryCode(deliveryCode: string): Promise<Purchase | null> {
  const purchases = await selectRows<Purchase>('purchases', {
    '"deliveryCode"': `ilike.${sanitizeRecordId(deliveryCode, 'El código adicional del QR')}`,
    limit: 1,
  });
  return purchases[0] ? ensureReturnedFlags(purchases[0]) : null;
}

export async function getPurchaseForDeliveryLookup(
  code?: string,
  deliveryCode?: string,
  signedToken?: string,
): Promise<Purchase | null> {
  const safeCode = code ? sanitizeRecordId(code, 'La compra') : null;
  const safeDeliveryCode = deliveryCode
    ? sanitizeRecordId(deliveryCode, 'El código adicional del QR')
    : null;
  const safeSignedToken = signedToken ? sanitizeSignedQrToken(signedToken) : null;

  try {
    const purchase = await callRpc<Purchase | null>('get_purchase_for_delivery_lookup', {
      p_code: safeCode,
      p_delivery_code: safeDeliveryCode,
      ...(safeSignedToken ? { p_token: safeSignedToken } : {}),
    });
    return purchase ? ensureReturnedFlags(purchase) : null;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('get_purchase_for_delivery_lookup')
    ) {
      if (safeCode) {
        return getPurchaseById(safeCode);
      }

      if (safeDeliveryCode) {
        return getPurchaseByDeliveryCode(safeDeliveryCode);
      }

      return null;
    }

    if (error instanceof Error && error.message.includes('El QR')) {
      throw error;
    }

    throw error;
  }
}

export async function getPurchasesByCedula(cedula: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', { cedula: `eq.${sanitizeCustomerIdentifier(cedula, 'La cédula')}` });
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function getPreSalesByCedula(cedula: string): Promise<Purchase[]> {
  const purchases = await fetchDashboardPreSales(sanitizeCustomerIdentifier(cedula, 'La cédula'));
  return sortByNewest(purchases.map(ensureReturnedFlags)).filter(isDashboardPreSale);
}

export async function getDashboardPreSales(): Promise<Purchase[]> {
  const purchases = await fetchDashboardPreSales();

  return sortByNewest(purchases.map(ensureReturnedFlags)).filter(isDashboardPreSale);
}

export async function getSelfServicePurchasesByCedula(cedula: string): Promise<Purchase[]> {
  const safeCedula = sanitizeCustomerIdentifier(cedula, 'La cédula');

  try {
    const purchases = await callRpc<Purchase[]>('get_self_service_purchases_by_cedula', {
      p_cedula: safeCedula,
    });
    return sortByNewest((purchases ?? []).map(ensureReturnedFlags));
  } catch (error) {
    if (error instanceof Error && error.message.includes('get_self_service_purchases_by_cedula')) {
      throw new Error('Falta actualizar Supabase. Ejecuta el SQL nuevo de supabase/schema.sql para consultar el historial de compras por cédula en autogestión.');
    }

    throw error;
  }
}

export async function getSelfServicePurchasesByCustomer(
  cedula: string,
  celular: string,
): Promise<Purchase[]> {
  sanitizeCustomerIdentifier(cedula, 'La cédula');
  sanitizeCustomerPhone(celular);
  throw new Error('El historial público por cédula y celular fue deshabilitado por seguridad. Consulte el estado con el código de compra o desde el dashboard autenticado.');
}

export async function getPurchasesByCelular(celular: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', { celular: `eq.${sanitizeCustomerPhone(celular)}` });
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function deleteSelfServicePurchaseHistoryByCedula(cedula: string): Promise<number> {
  const safeCedula = sanitizeCustomerIdentifier(cedula, 'La cédula');
  const response = await fetch('/api/dashboard/self-service-history', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ cedula: safeCedula }),
  });

  const responseBody = await response.json().catch(() => null) as {
    deletedCount?: number;
    message?: string;
  } | null;

  if (!response.ok) {
    throw new Error(responseBody?.message || 'No se pudo eliminar el historial de autogestión.');
  }

  return responseBody?.deletedCount ?? 0;
}
export async function addPurchase(purchase: NewPurchase): Promise<Purchase> {
  const rpcPayload = {
    p_items: purchase.items.map(item => ({ id: item.id, quantity: item.quantity })),
    p_cedula: purchase.cedula,
    p_celular: purchase.celular,
    p_seller_id: purchase.sellerId,
    p_seller_name: purchase.sellerName,
    p_date: getCurrentDateLabel(),
    p_status: purchase.status === 'delivered' ? 'delivered' : 'paid',
  };

  try {
    const savedPurchase = ensureReturnedFlags(await callRpc<Purchase>('create_pos_purchase_with_stock', rpcPayload));
    const purchaseWithDelivery = withDeliveryAccess(savedPurchase);
    await updateById<Purchase>('purchases', purchaseWithDelivery.id, {
      deliveryCode: purchaseWithDelivery.deliveryCode,
      qrPayload: purchaseWithDelivery.qrPayload,
      items: purchaseWithDelivery.items,
    });
    await addAuditLog({
      userId: purchaseWithDelivery.sellerId ?? 'system',
      userName: purchaseWithDelivery.sellerName ?? 'Sistema',
      action: 'TICKET_SELL',
      details: `Venta POS ${purchaseWithDelivery.id} registrada por ${purchaseWithDelivery.total}. Unidades: ${countPurchaseUnits(purchaseWithDelivery.items)}. Cliente: ${purchaseWithDelivery.cedula || 'N/A'}.`,
    });
    return purchaseWithDelivery;
  } catch (error) {
    if (error instanceof Error && error.message.includes('create_pos_purchase_with_stock')) {
      throw new Error('Falta actualizar Supabase. Ejecuta el SQL nuevo de supabase/schema.sql para descontar stock al registrar ventas de forma segura.');
    }

    throw error;
  }
}

export async function addPreSalePurchase(purchase: NewPurchase): Promise<Purchase> {
  const isSelfService = !purchase.sellerId && !purchase.sellerName;
  if (isSelfService) {
    const cedula = sanitizeCustomerIdentifier(purchase.cedula, 'La cédula');
    const celular = sanitizeCustomerPhone(purchase.celular);

    try {
      const savedPurchase = ensureReturnedFlags(await callRpc<Purchase>('create_self_service_purchase', {
        p_items: normalizeCartInput(purchase.items),
        p_cedula: cedula,
        p_celular: celular,
      }));

      await addAuditLog({
        userId: savedPurchase.cedula,
        userName: 'Cliente (Autogestión)',
        action: 'SELF_SERVICE_PURCHASE',
        details: `Nueva compra de autogestión ${savedPurchase.id} registrada por ${savedPurchase.total}. Unidades: ${countPurchaseUnits(savedPurchase.items)}.`,
      });

      return savedPurchase;
    } catch (error) {
      if (error instanceof Error && error.message.includes('create_self_service_purchase')) {
        throw new Error('Falta actualizar Supabase. Ejecuta el SQL nuevo de supabase/schema.sql para crear compras de autogestión con precios, stock y QR firmados desde la base.');
      }

      throw error;
    }
  }

  const cedula = sanitizeCustomerIdentifier(purchase.cedula, 'La cédula');
  const celular = sanitizeCustomerPhone(purchase.celular);
  const sellerId = sanitizeRecordId(purchase.sellerId ?? '', 'El vendedor');
  const sellerName = String(purchase.sellerName ?? '').trim();

  if (!sellerName || sellerName.length > 120) {
    throw new Error('El nombre del vendedor no tiene un formato válido.');
  }

  let savedPurchase: Purchase;

  try {
    savedPurchase = ensureReturnedFlags(await createDashboardPreSalePurchase({
      items: normalizeCartInput(purchase.items),
      cedula,
      celular,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.includes('create_dashboard_presale_purchase')) {
      throw new Error('Falta actualizar Supabase. Ejecuta el SQL nuevo de supabase/schema.sql para registrar preventas y aumentar el stock planificado de forma segura.');
    }

    throw error;
  }

  await addAuditLog({
    userId: savedPurchase.sellerId ?? 'system',
    userName: savedPurchase.sellerName ?? 'Sistema',
    action: 'TICKET_ISSUE',
    details: `Preventa ${savedPurchase.id} registrada por ${savedPurchase.total}. Unidades: ${countPurchaseUnits(savedPurchase.items)}. Cliente: ${savedPurchase.cedula}.`,
  });

  return savedPurchase;
}

export async function updatePurchase(purchaseId: string, data: Partial<Purchase>): Promise<void> {
  await updateById<Purchase>('purchases', sanitizeRecordId(purchaseId, 'La compra'), data);
}

async function updatePurchaseStatusWithStock(purchaseId: string, targetStatus: Purchase['status']): Promise<Purchase> {
  try {
    return ensureReturnedFlags(await callRpc<Purchase>('update_purchase_status_with_stock', {
      p_purchase_id: sanitizeRecordId(purchaseId, 'La compra'),
      p_target_status: targetStatus,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.includes('update_purchase_status_with_stock')) {
      throw new Error('Falta actualizar Supabase. Ejecuta el SQL nuevo de supabase/schema.sql para confirmar pagos y descontar stock con permisos seguros.');
    }

    throw error;
  }
}

export async function cancelPurchaseAndUpdateStock(purchaseId: string): Promise<void> {
  const safePurchaseId = sanitizeRecordId(purchaseId, 'La compra');
  const purchase = await getPurchaseById(safePurchaseId);
  if (!purchase) throw new Error("Compra no encontrada.");
  if (purchase.status === 'cancelled') throw new Error('Esta compra ya fue cancelada.');

  const isSellerPreSale = Boolean(purchase.sellerId)
    && purchase.id.startsWith('PV')
    && (purchase.status === 'pre-sale' || purchase.status === 'pre-sale-confirmed');

  if (isSellerPreSale && purchase.items.some(item => normalizeDeliveredQuantity(item) > 0)) {
    throw new Error('No se puede eliminar una preventa con unidades entregadas.');
  }

  const productMap = await getProductsByIds(purchase.items.map(item => item.id));
  await Promise.all(purchase.items.map(item => {
    const product = productMap.get(item.id);
    if (!product) throw new Error(`Producto ${item.id} no encontrado.`);

    if (isSellerPreSale) {
      return patchProduct(item.id, {
        stock: Math.max(product.stock - item.quantity, 0),
        preSaleSold: Math.max((product.preSaleSold ?? 0) - item.quantity, 0),
      });
    }

    if (purchase.status === 'pending' && !purchase.sellerId) {
      return Promise.resolve();
    }

    return patchProduct(item.id, { stock: product.stock + item.quantity });
  }));

  await updateById<Purchase>('purchases', safePurchaseId, { status: 'cancelled' });
}

export async function updatePendingPurchase(
  purchaseId: string,
  newCart: PurchaseCartInput[],
  options: UpdatePendingPurchaseOptions = {}
): Promise<Purchase> {
  const safePurchaseId = sanitizeRecordId(purchaseId, 'La compra');
  if (options.selfServiceOnly) {
    if (!options.customerCedula || !options.customerCelular) {
      throw new Error('Los datos del cliente son requeridos para modificar esta compra.');
    }

    try {
      const updatedPurchase = ensureReturnedFlags(await callRpc<Purchase>('update_self_service_pending_purchase', {
        p_purchase_id: safePurchaseId,
        p_items: normalizeCartInput(newCart),
        p_cedula: sanitizeCustomerIdentifier(options.customerCedula, 'La cédula'),
        p_celular: sanitizeCustomerPhone(options.customerCelular),
      }));

      return updatedPurchase;
    } catch (error) {
      if (error instanceof Error && error.message.includes('update_self_service_pending_purchase')) {
        throw new Error('Falta actualizar Supabase. Ejecuta el SQL nuevo de supabase/schema.sql para modificar compras pendientes de autogestión.');
      }

      throw error;
    }
  }

  const originalPurchase = await getPurchaseById(safePurchaseId);
  if (!originalPurchase || (originalPurchase.status !== 'pending' && originalPurchase.status !== 'pre-sale')) {
    throw new Error("Compra no encontrada o ya ha sido procesada.");
  }

  if (options.selfServiceOnly && originalPurchase.sellerId) {
    throw new Error('Esta compra no pertenece a autogestión.');
  }

  if (options.customerCedula && originalPurchase.cedula !== sanitizeCustomerIdentifier(options.customerCedula, 'La cédula')) {
    throw new Error('Los datos del cliente no coinciden con esta compra.');
  }

  if (options.customerCelular && originalPurchase.celular !== sanitizeCustomerPhone(options.customerCelular)) {
    throw new Error('Los datos del cliente no coinciden con esta compra.');
  }

  const verifiedCart = await buildVerifiedCartItems(
    newCart,
    originalPurchase.sellerId ? 'presale' : 'self-service'
  );

  const originalItems = originalPurchase.items;
  const isSelfService = !originalPurchase.sellerId;
  const isPreSale = originalPurchase.id.startsWith('PV') && !isSelfService;
  const originalItemMap = new Map(originalItems.map(item => [item.id, item.quantity]));
  const newItemMap = new Map(verifiedCart.items.map(item => [item.id, item.quantity]));
  const allProductIds = [...new Set([...originalItemMap.keys(), ...newItemMap.keys()])];
  const productMap = await getProductsByIds(allProductIds);

  if (isSelfService) {
    const reservedQuantities = await getSelfServiceReservations(safePurchaseId);
    assertAvailableStock(verifiedCart.items, productMap, reservedQuantities);
  }

  await Promise.all(allProductIds.map(productId => {
    const origQty = originalItemMap.get(productId) || 0;
    const newQty = newItemMap.get(productId) || 0;
    const diff = newQty - origQty;
    if (diff === 0) return Promise.resolve();

    const product = productMap.get(productId);
    if (!product) throw new Error(`Producto ${productId} no encontrado.`);

    if (isPreSale) {
      return patchProduct(productId, {
        stock: product.stock + diff,
        preSaleSold: Math.max((product.preSaleSold ?? 0) + diff, 0),
      });
    }

    if (isSelfService) {
      return Promise.resolve();
    }

    const newStock = product.stock - diff;
    if (newStock < 0) throw new Error(`Stock insuficiente para ${product.name}.`);
    return patchProduct(productId, { stock: newStock });
  }));

  const itemsToSave = verifiedCart.items.map(item => ({ ...item, returned: false, deliveredQuantity: 0 }));
  const modifiedAt = isSelfService ? new Date().toISOString() : originalPurchase.modifiedAt;
  const modificationCount = isSelfService
    ? (originalPurchase.modificationCount ?? 0) + 1
    : originalPurchase.modificationCount;
  const updatedPurchase: Purchase = {
    ...originalPurchase,
    items: itemsToSave,
    total: verifiedCart.total,
    date: getCurrentDateLabel(),
    modifiedAt,
    modificationCount,
  };

  await updateById<Purchase>('purchases', safePurchaseId, {
    items: itemsToSave,
    total: verifiedCart.total,
    date: updatedPurchase.date,
    ...(isSelfService ? { modifiedAt, modificationCount } : {}),
  });

  await addAuditLog({
    userId: isSelfService ? originalPurchase.cedula : (originalPurchase.sellerId ?? 'system'),
    userName: isSelfService ? `Cliente (Autogestión)` : (originalPurchase.sellerName ?? 'Sistema'),
    action: 'PURCHASE_EDIT',
    details: isSelfService
      ? createSelfServiceEditAuditDetails({
          purchaseId: safePurchaseId,
          beforeTotal: originalPurchase.total,
          afterTotal: verifiedCart.total,
          beforeItems: originalItems,
          afterItems: itemsToSave,
        })
      : `Preventa ${safePurchaseId} modificada. Total nuevo: ${verifiedCart.total}. Unidades: ${countPurchaseUnits(itemsToSave)}.`,
  });

  return updatedPurchase;
}

export async function confirmPreSaleAndUpdateStock(purchaseId: string, currentUser: User): Promise<void> {
  if (currentUser.role === 'seller') {
    throw new Error('El vendedor solo puede registrar entregas de compras ya confirmadas.');
  }

  const safePurchaseId = sanitizeRecordId(purchaseId, 'La compra');
  const purchase = await getPurchaseById(safePurchaseId);
  if (!purchase) throw new Error("Preventa no encontrada.");
  if (purchase.status !== 'pre-sale') throw new Error("Esta preventa ya ha sido confirmada o procesada.");

  await updatePurchaseStatusWithStock(safePurchaseId, 'pre-sale-confirmed');

  await addAuditLog({
    userId: currentUser.id,
    userName: currentUser.name,
    action: 'PAYMENT_CONFIRM',
    details: `Preventa ${safePurchaseId} confirmada. El stock ya fue aumentado al registrar la preventa y no se descuenta al confirmar el pago.`,
  });
}

export async function confirmPendingPurchaseAndUpdateStock(purchaseId: string, currentUser: User): Promise<void> {
  if (currentUser.role === 'seller') {
    throw new Error('El vendedor solo puede registrar entregas de compras ya confirmadas.');
  }

  const safePurchaseId = sanitizeRecordId(purchaseId, 'La compra');
  const purchase = await getPurchaseById(safePurchaseId);
  if (!purchase) throw new Error("Compra pendiente no encontrada.");
  if (purchase.status !== 'pending') throw new Error("Esta compra ya ha sido confirmada o procesada.");

  await updatePurchaseStatusWithStock(safePurchaseId, 'paid');

  await addAuditLog({
    userId: currentUser.id,
    userName: currentUser.name,
    action: 'PAYMENT_CONFIRM',
    details: purchase.sellerId
      ? `Compra pendiente ${safePurchaseId} pagada. Stock descontado.`
      : `Compra de autogestión ${safePurchaseId} pagada. Stock descontado al confirmar el pago.`,
  });
}

async function deliverPurchaseItemsForLookup(
  purchaseId: string,
  deliveryQuantities: Record<string, number>,
  currentUser: User,
  signedToken?: string,
): Promise<Purchase> {
  const safePurchaseId = sanitizeRecordId(purchaseId, 'La compra');
  const safeSignedToken = signedToken ? sanitizeSignedQrToken(signedToken) : null;
  const safeDeliveryQuantities = Object.entries(deliveryQuantities).reduce<Record<string, number>>(
    (acc, [productId, quantity]) => {
      const safeProductId = sanitizeRecordId(productId, 'El producto');
      const normalizedQuantity = Number(quantity);

      if (!Number.isSafeInteger(normalizedQuantity) || normalizedQuantity < 0) {
        throw new Error('Las cantidades de entrega no son válidas.');
      }

      acc[safeProductId] = normalizedQuantity;
      return acc;
    },
    {},
  );

  const updatedPurchase = await callRpc<Purchase>('deliver_purchase_items_for_lookup', {
    p_purchase_id: safePurchaseId,
    p_delivery_quantities: safeDeliveryQuantities,
    p_user_id: currentUser.id,
    p_user_name: currentUser.name,
    ...(safeSignedToken ? { p_token: safeSignedToken } : {}),
  });

  return ensureReturnedFlags(updatedPurchase);
}


export async function deliverPurchaseItems(
  purchaseId: string,
  deliveryQuantities: Record<string, number>,
  currentUser: User,
  expectedDeliveryCode?: string,
  signedToken?: string
): Promise<Purchase> {
  const safePurchaseId = sanitizeRecordId(purchaseId, 'La compra');

  if (currentUser.role === 'seller') {
    return deliverPurchaseItemsForLookup(safePurchaseId, deliveryQuantities, currentUser, signedToken);
  }

  const purchase = await getPurchaseById(safePurchaseId);
  if (!purchase) throw new Error('Compra no encontrada.');
  if (!['pending', 'paid', 'pre-sale-confirmed', 'partially-delivered', 'delivered'].includes(purchase.status)) {
    throw new Error('Solo se pueden entregar compras pendientes, pagadas o preventas confirmadas.');
  }

  const savedDeliveryCode = purchase.deliveryCode || '';
  if (expectedDeliveryCode && savedDeliveryCode && expectedDeliveryCode !== savedDeliveryCode) {
    throw new Error('El código adicional de entrega no coincide con esta compra.');
  }

  return deliverPurchaseItemsForLookup(safePurchaseId, deliveryQuantities, currentUser, signedToken);
}
export async function finalizeSelfServiceValidation(
  purchaseId: string,
  acceptedQuantities: Record<string, number>,
  currentUser: User,
): Promise<Purchase> {
  const safePurchaseId = sanitizeRecordId(purchaseId, 'La compra');
  const safeAcceptedQuantities = Object.entries(acceptedQuantities).reduce<Record<string, number>>(
    (acc, [productId, quantity]) => {
      const safeProductId = sanitizeRecordId(productId, 'El producto');
      const normalizedQuantity = Number(quantity);

      if (!Number.isSafeInteger(normalizedQuantity) || normalizedQuantity < 0) {
        throw new Error('Las cantidades aprobadas no son válidas.');
      }

      acc[safeProductId] = normalizedQuantity;
      return acc;
    },
    {},
  );

  const updatedPurchase = await callRpc<Purchase>('finalize_self_service_validation', {
    p_purchase_id: safePurchaseId,
    p_accepted_quantities: safeAcceptedQuantities,
    p_user_id: currentUser.id,
    p_user_name: currentUser.name,
  });

  return ensureReturnedFlags(updatedPurchase);
}
