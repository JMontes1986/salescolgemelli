import { callRpc, insertRow, insertRowMinimal, selectRows, selectSingle, updateById } from "@/lib/supabase";
import type { Purchase, NewPurchase, Product, CartItem, User, ProductAvailability } from "@/lib/types";
import { addAuditLog } from "./audit-service";
import { normalizeProductAvailability } from "./product-service";

export type { NewPurchase } from "@/lib/types";

const MAX_DISTINCT_ITEMS_PER_PURCHASE = 30;
const MAX_QUANTITY_PER_ITEM = 99;
const recordIdPattern = /^[0-9A-Za-z_-]{1,80}$/;
const customerIdPattern = /^[0-9A-Za-z.-]{4,30}$/;
const colombianPhonePattern = /^[0-9+()\s-]{7,20}$/;

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

export async function getSelfServiceReservedQuantityMap(excludePurchaseId?: string): Promise<Record<string, number>> {
  const safeExcludePurchaseId = excludePurchaseId
    ? sanitizeRecordId(excludePurchaseId, 'La compra')
    : null;

  try {
    const reservedQuantities = await callRpc<Record<string, number>>('get_self_service_reserved_quantities', {
      p_exclude_purchase_id: safeExcludePurchaseId,
    });
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

export async function getPurchases(idPrefix?: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', idPrefix ? { id: `like.${idPrefix}%` } : {});
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function getRecentPreSales(): Promise<Purchase[]> {
  const purchases = await getPurchases('PV');
  return purchases.filter(isDashboardPreSale).slice(0, 5);
}

export async function getSelfServicePurchases(limit = 30): Promise<Purchase[]> {
  const purchases = await getPurchases("PV");
  return purchases
    .filter(purchase => !purchase.sellerId)
    .slice(0, limit);
}

export async function getPurchaseById(id: string): Promise<Purchase | null> {
  const purchase = await selectSingle<Purchase>('purchases', { id: `eq.${sanitizeRecordId(id, 'La compra')}` });
  return purchase ? ensureReturnedFlags(purchase) : null;
}

export async function getPurchasesByCedula(cedula: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', { cedula: `eq.${sanitizeCustomerIdentifier(cedula, 'La cédula')}` });
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function getPreSalesByCedula(cedula: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', { cedula: `eq.${sanitizeCustomerIdentifier(cedula, 'La cédula')}`, id: 'like.PV%' });
  return sortByNewest(purchases.map(ensureReturnedFlags)).filter(isDashboardPreSale);
}

export async function getDashboardPreSales(): Promise<Purchase[]> {
  const purchases = await getPurchases('PV');
  return purchases.filter(isDashboardPreSale);
}

export async function getSelfServicePurchasesByCedula(cedula: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', {
    cedula: `eq.${sanitizeCustomerIdentifier(cedula, 'La cédula')}`,
  });
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function getSelfServicePurchasesByCustomer(cedula: string): Promise<Purchase[]> {
  const safeCedula = sanitizeCustomerIdentifier(cedula, 'La cédula');

  try {
    const purchases = await callRpc<Purchase[]>('get_self_service_purchases_by_customer', {
      p_cedula: safeCedula,
    });
    return sortByNewest(purchases.map(ensureReturnedFlags));
  } catch (error) {
    if (error instanceof Error && error.message.includes('get_self_service_purchases_by_customer')) {
      throw new Error('Falta actualizar Supabase. Ejecuta el SQL nuevo de supabase/schema.sql y recarga el esquema para cargar compras por cédula.');
    }

    throw error;
  }
}

export async function getPurchasesByCelular(celular: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', { celular: `eq.${sanitizeCustomerPhone(celular)}` });
  return sortByNewest(purchases.map(ensureReturnedFlags));
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
  const verifiedCart = await buildVerifiedCartItems(
    purchase.items,
    isSelfService ? 'self-service' : 'presale'
  );
  if (isSelfService) {
    const reservedQuantities = await getSelfServiceReservations();
    assertAvailableStock(verifiedCart.items, verifiedCart.productMap, reservedQuantities);
  }

  const cedula = sanitizeCustomerIdentifier(purchase.cedula, 'La cédula');
  const celular = sanitizeCustomerPhone(purchase.celular);
  const firstItemInitial = verifiedCart.items.length > 0
    ? verifiedCart.items[0].name.charAt(0).toUpperCase().replace(/[^A-Z]/g, 'X')
    : 'X';

  const next = await getNextCounter('preSaleCounter');
  const generatedId = `PV${firstItemInitial}${String(next).padStart(4, '0')}`;

  if (!isSelfService) {
    await Promise.all(verifiedCart.items.map(item => {
      const product = verifiedCart.productMap.get(item.id)!;
      return patchProduct(item.id, { preSaleSold: (product.preSaleSold ?? 0) + item.quantity });
    }));
  }

  const itemsToSave = verifiedCart.items.map(item => ({ ...item, returned: false, deliveredQuantity: 0 }));
  const savedPurchase: Purchase = withDeliveryAccess({
    ...purchase,
    id: generatedId,
    date: getCurrentDateLabel(),
    total: verifiedCart.total,
    items: itemsToSave,
    cedula,
    celular,
    sellerId: isSelfService ? undefined : purchase.sellerId,
    sellerName: isSelfService ? undefined : purchase.sellerName,
    status: isSelfService ? 'pending' : 'pre-sale',
  });
  await insertRowMinimal('purchases', savedPurchase);
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
  if (!purchase) throw new Error("Purchase not found");

  const productMap = await getProductsByIds(purchase.items.map(item => item.id));
  await Promise.all(purchase.items.map(item => {
    const product = productMap.get(item.id);
    if (!product) throw new Error(`Producto ${item.id} no encontrado.`);

    if (purchase.status === 'pre-sale') {
      if (purchase.sellerId) {
        return patchProduct(item.id, { preSaleSold: Math.max((product.preSaleSold ?? 0) - item.quantity, 0) });
      }

      return Promise.resolve();
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

      await addAuditLog({
        userId: updatedPurchase.cedula,
        userName: `Cliente (Autogestión)`,
        action: 'PURCHASE_EDIT',
        details: `Cliente modificó la compra pendiente ${safePurchaseId}.`,
      });

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
      return patchProduct(productId, { preSaleSold: (product.preSaleSold ?? 0) + diff });
    }

    if (isSelfService) {
      return Promise.resolve();
    }

    const newStock = product.stock - diff;
    if (newStock < 0) throw new Error(`Stock insuficiente para ${product.name}.`);
    return patchProduct(productId, { stock: newStock });
  }));

  const itemsToSave = verifiedCart.items.map(item => ({ ...item, returned: false, deliveredQuantity: 0 }));
  const updatedPurchase: Purchase = {
    ...originalPurchase,
    items: itemsToSave,
    total: verifiedCart.total,
    date: getCurrentDateLabel(),
  };

  await updateById<Purchase>('purchases', safePurchaseId, {
    items: itemsToSave,
    total: verifiedCart.total,
    date: updatedPurchase.date,
  });

  await addAuditLog({
    userId: originalPurchase.cedula,
    userName: `Cliente (Autogestión)`,
    action: 'PURCHASE_EDIT',
    details: `Cliente modificó la compra pendiente ${safePurchaseId}.`,
  });

  return updatedPurchase;
}

export async function confirmPreSaleAndUpdateStock(purchaseId: string, currentUser: User): Promise<void> {
  const safePurchaseId = sanitizeRecordId(purchaseId, 'La compra');
  const purchase = await getPurchaseById(safePurchaseId);
  if (!purchase) throw new Error("Preventa no encontrada.");
  if (purchase.status !== 'pre-sale') throw new Error("Esta preventa ya ha sido confirmada o procesada.");

  await updatePurchaseStatusWithStock(safePurchaseId, 'pre-sale-confirmed');

  await addAuditLog({
    userId: currentUser.id,
    userName: currentUser.name,
    action: 'PAYMENT_CONFIRM',
    details: `Preventa ${safePurchaseId} confirmada. Stock descontado.`,
  });
}

export async function confirmPendingPurchaseAndUpdateStock(purchaseId: string, currentUser: User): Promise<void> {
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


export async function deliverPurchaseItems(
  purchaseId: string,
  deliveryQuantities: Record<string, number>,
  currentUser: User,
  expectedDeliveryCode?: string
): Promise<Purchase> {
  const safePurchaseId = sanitizeRecordId(purchaseId, 'La compra');
  let purchase = await getPurchaseById(safePurchaseId);
  if (!purchase) throw new Error('Compra no encontrada.');
  if (!['pending', 'paid', 'pre-sale-confirmed', 'partially-delivered', 'delivered'].includes(purchase.status)) {
    throw new Error('Solo se pueden entregar compras pendientes, pagadas o preventas confirmadas.');
  }

  const savedDeliveryCode = purchase.deliveryCode || '';
  if (savedDeliveryCode && !expectedDeliveryCode) {
    throw new Error('Ingrese el código adicional que aparece junto al QR para validar la entrega.');
  }

  if (expectedDeliveryCode && savedDeliveryCode && expectedDeliveryCode !== savedDeliveryCode) {
    throw new Error('El código adicional de entrega no coincide con esta compra.');
  }

  if (purchase.status === 'pending') {
    purchase = await updatePurchaseStatusWithStock(safePurchaseId, 'paid');

    await addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'PAYMENT_CONFIRM',
      details: `Compra de autogestión ${safePurchaseId} confirmada desde entrega. Stock descontado al registrar la entrega.`,
    });
  }

  let movedUnits = 0;
  const updatedItems = purchase.items.map((item) => {
    const requested = Number(deliveryQuantities[item.id] || 0);
    if (!Number.isSafeInteger(requested) || requested < 0) {
      throw new Error(`Cantidad inválida para ${item.name}.`);
    }

    const deliveredQuantity = normalizeDeliveredQuantity(item);
    const pendingQuantity = item.quantity - deliveredQuantity;
    const quantityToDeliver = Math.min(requested, pendingQuantity);
    movedUnits += quantityToDeliver;

    return {
      ...item,
      returned: item.returned || false,
      deliveredQuantity: deliveredQuantity + quantityToDeliver,
    };
  });

  if (movedUnits <= 0) {
    throw new Error('Seleccione al menos una unidad pendiente para entregar.');
  }

  const allDelivered = updatedItems.every(item => (item.deliveredQuantity || 0) >= item.quantity);
  const nextStatus: Purchase['status'] = allDelivered ? 'delivered' : 'partially-delivered';
  const deliveryCode = purchase.deliveryCode || generateDeliveryCode();
  const updatedPurchase = ensureReturnedFlags({
    ...purchase,
    items: updatedItems,
    status: nextStatus,
    deliveryCode,
    qrPayload: purchase.qrPayload || buildDeliveryQrPayload(purchase.id, deliveryCode),
  });

  await updateById<Purchase>('purchases', safePurchaseId, {
    items: updatedPurchase.items,
    status: nextStatus,
    deliveryCode: updatedPurchase.deliveryCode,
    qrPayload: updatedPurchase.qrPayload,
  });

  await addAuditLog({
    userId: currentUser.id,
    userName: currentUser.name,
    action: 'TICKET_REDEEM',
    details: `Se entregaron ${movedUnits} unidad(es) de la compra ${safePurchaseId}. Estado: ${nextStatus}.`,
  });

  return updatedPurchase;
}
