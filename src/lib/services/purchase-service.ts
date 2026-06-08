import { callRpc, insertRow, insertRowMinimal, selectRows, selectSingle, updateById } from "@/lib/supabase";
import type { Purchase, NewPurchase, Product, CartItem, User, ProductAvailability } from "@/lib/types";
import { addAuditLog } from "./audit-service";
import { normalizeProductAvailability } from "./product-service";

export type { NewPurchase } from "@/lib/types";

const MAX_DISTINCT_ITEMS_PER_PURCHASE = 30;
const MAX_QUANTITY_PER_ITEM = 99;
const recordIdPattern = /^[0-9A-Za-z_-]{1,80}$/;
const customerIdPattern = /^[0-9A-Za-z.-]{5,30}$/;
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

function ensureReturnedFlags(purchase: Purchase): Purchase {
  return {
    ...purchase,
    items: purchase.items.map((item: CartItem) => ({ ...item, returned: item.returned || false })),
  };
}

export function getSelfServiceReservedQuantities(_purchases: Purchase[]): Record<string, number> {
  // Autogestión ahora descuenta el inventario al crear o editar la compra.
  // No se deben volver a restar esas unidades como "reservadas" al calcular disponibilidad.
  return {};
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
  await updateById<Product>('products', sanitizeRecordId(productId, 'El producto'), patch);
}

function sanitizeRecordId(value: string, fieldName: string) {
  const normalized = String(value ?? '').trim();

  if (!recordIdPattern.test(normalized)) {
    throw new Error(`${fieldName} tiene un identificador inválido.`);
  }

  return normalized;
}

function sanitizeCustomerIdentifier(value: string, fieldName: string) {
  const normalized = value.trim();

  if (!customerIdPattern.test(normalized)) {
    throw new Error(`${fieldName} no tiene un formato válido.`);
  }

  return normalized;
}

function sanitizeCustomerPhone(value: string) {
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
  productMap: Map<string, Product>
) {
  for (const item of items) {
    const product = productMap.get(item.id);
    if (!product) throw new Error(`Producto con ID ${item.id} no encontrado.`);

    if (product.stock < item.quantity) {
      throw new Error(`Stock insuficiente para ${product.name}.`);
    }
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
  const purchases = await selectRows<Purchase>('purchases', { id: 'like.PV%', order: 'date.desc', limit: 5 });
  return purchases.map(ensureReturnedFlags);
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
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function getSelfServicePurchasesByCustomer(cedula: string, celular: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', {
    cedula: `eq.${sanitizeCustomerIdentifier(cedula, 'La cédula')}`,
    celular: `eq.${sanitizeCustomerPhone(celular)}`,
    id: 'like.PV%',
  });
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function getPurchasesByCelular(celular: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', { celular: `eq.${sanitizeCustomerPhone(celular)}` });
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function addPurchase(purchase: NewPurchase): Promise<Purchase> {
  const verifiedCart = await buildVerifiedCartItems(purchase.items, 'pos');
  assertAvailableStock(verifiedCart.items, verifiedCart.productMap);

  const firstItemInitial = verifiedCart.items.length > 0
    ? verifiedCart.items[0].name.charAt(0).toUpperCase()
    : 'X';

  const next = await getNextCounter('purchaseCounter');
  const generatedId = `CG${firstItemInitial}${String(next).padStart(4, '0')}`;

  await Promise.all(verifiedCart.items.map(item => {
    const product = verifiedCart.productMap.get(item.id)!;
    return patchProduct(item.id, { stock: product.stock - item.quantity });
  }));

  const itemsToSave = verifiedCart.items.map(item => ({ ...item, returned: false }));
  return insertRow<Purchase>('purchases', {
    ...purchase,
    id: generatedId,
    date: getCurrentDateLabel(),
    total: verifiedCart.total,
    items: itemsToSave,
    status: purchase.status === 'delivered' ? 'delivered' : 'paid',
  });
}

export async function addPreSalePurchase(purchase: NewPurchase): Promise<Purchase> {
  const isSelfService = !purchase.sellerId && !purchase.sellerName;
  const verifiedCart = await buildVerifiedCartItems(
    purchase.items,
    isSelfService ? 'self-service' : 'presale'
  );
  if (isSelfService) {
    assertAvailableStock(verifiedCart.items, verifiedCart.productMap);
  }

  const cedula = sanitizeCustomerIdentifier(purchase.cedula, 'La cédula');
  const celular = sanitizeCustomerPhone(purchase.celular);
  const firstItemInitial = verifiedCart.items.length > 0
    ? verifiedCart.items[0].name.charAt(0).toUpperCase().replace(/[^A-Z]/g, 'X')
    : 'X';

  const next = await getNextCounter('preSaleCounter');
  const generatedId = `PV${firstItemInitial}${String(next).padStart(4, '0')}`;

  await Promise.all(verifiedCart.items.map(item => {
    const product = verifiedCart.productMap.get(item.id)!;

    if (isSelfService) {
      return patchProduct(item.id, { stock: product.stock - item.quantity });
    }

    return patchProduct(item.id, { preSaleSold: (product.preSaleSold ?? 0) + item.quantity });
  }));

  const itemsToSave = verifiedCart.items.map(item => ({ ...item, returned: false }));
  const savedPurchase: Purchase = {
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
  };
  await insertRowMinimal('purchases', savedPurchase);
  return savedPurchase;
}

export async function updatePurchase(purchaseId: string, data: Partial<Purchase>): Promise<void> {
  await updateById<Purchase>('purchases', sanitizeRecordId(purchaseId, 'La compra'), data);
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

    const newStock = product.stock - diff;
    if (newStock < 0) throw new Error(`Stock insuficiente para ${product.name}.`);
    return patchProduct(productId, { stock: newStock });
  }));

  const itemsToSave = verifiedCart.items.map(item => ({ ...item, returned: false }));
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

  const productMap = await getProductsByIds(purchase.items.map(item => item.id));
  await Promise.all(purchase.items.map(item => {
    const product = productMap.get(item.id);
    if (!product) throw new Error(`Producto ${item.id} no encontrado.`);

    const newStock = product.stock - item.quantity;
    if (newStock < 0) throw new Error(`Stock insuficiente para ${product.name}.`);

    return patchProduct(item.id, {
      stock: newStock,
      preSaleSold: Math.max((product.preSaleSold ?? 0) - item.quantity, 0),
    });
  }));

  await updateById<Purchase>('purchases', safePurchaseId, { status: 'pre-sale-confirmed' });

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

  if (purchase.sellerId) {
    const productMap = await getProductsByIds(purchase.items.map(item => item.id));
    await Promise.all(purchase.items.map(item => {
      const product = productMap.get(item.id);
      if (!product) throw new Error(`Producto ${item.id} no encontrado.`);

      const newStock = product.stock - item.quantity;
      if (newStock < 0) throw new Error(`Stock insuficiente para ${product.name}.`);

      return patchProduct(item.id, { stock: newStock });
    }));
  }

  await updateById<Purchase>('purchases', safePurchaseId, { status: 'paid' });

  await addAuditLog({
    userId: currentUser.id,
    userName: currentUser.name,
    action: 'PAYMENT_CONFIRM',
    details: purchase.sellerId
      ? `Compra pendiente ${safePurchaseId} pagada. Stock descontado.`
      : `Compra de autogestión ${safePurchaseId} pagada. El stock ya estaba descontado desde la generación del código.`,
  });
}
