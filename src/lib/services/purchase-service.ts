import { callRpc, insertRow, selectRows, selectSingle, updateById } from "@/lib/supabase";
import type { Purchase, NewPurchase, Product, CartItem, User } from "@/lib/types";
import { addAuditLog } from "./audit-service";

export type { NewPurchase } from "@/lib/types";

function sortByNewest(purchases: Purchase[]) {
  return purchases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function ensureReturnedFlags(purchase: Purchase): Purchase {
  return {
    ...purchase,
    items: purchase.items.map((item: CartItem) => ({ ...item, returned: item.returned || false })),
  };
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
  const uniqueIds = [...new Set(ids)];
  const products = await selectRows<Product>('products', { id: `in.(${uniqueIds.join(',')})` });
  return new Map(products.map(product => [product.id, product]));
}

async function patchProduct(productId: string, patch: Partial<Product>) {
  await updateById<Product>('products', productId, patch);
}

export async function getPurchases(idPrefix?: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', idPrefix ? { id: `like.${idPrefix}%` } : {});
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function getRecentPreSales(): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', { id: 'like.PV%', order: 'date.desc', limit: 5 });
  return purchases.map(ensureReturnedFlags);
}

export async function getPurchaseById(id: string): Promise<Purchase | null> {
  const purchase = await selectSingle<Purchase>('purchases', { id: `eq.${id}` });
  return purchase ? ensureReturnedFlags(purchase) : null;
}

export async function getPurchasesByCedula(cedula: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', { cedula: `eq.${cedula}` });
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function getPreSalesByCedula(cedula: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', { cedula: `eq.${cedula}`, id: 'like.PV%' });
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function getPurchasesByCelular(celular: string): Promise<Purchase[]> {
  const purchases = await selectRows<Purchase>('purchases', { celular: `eq.${celular}` });
  return sortByNewest(purchases.map(ensureReturnedFlags));
}

export async function addPurchase(purchase: NewPurchase): Promise<Purchase> {
  const firstItemInitial = purchase.items.length > 0
    ? purchase.items[0].name.charAt(0).toUpperCase()
    : 'X';

  const productMap = await getProductsByIds(purchase.items.map(item => item.id));

  for (const item of purchase.items) {
    const product = productMap.get(item.id);
    if (!product) throw new Error(`Producto con ID ${item.id} no encontrado.`);
    if (purchase.status !== 'pre-sale' && product.stock < item.quantity) {
      throw new Error(`Stock insuficiente para ${product.name}.`);
    }
  }

  const next = await getNextCounter('purchaseCounter');
  const generatedId = `CG${firstItemInitial}${String(next).padStart(4, '0')}`;

  if (purchase.status !== 'pre-sale') {
    await Promise.all(purchase.items.map(item => {
      const product = productMap.get(item.id)!;
      return patchProduct(item.id, { stock: product.stock - item.quantity });
    }));
  }

  const itemsToSave = purchase.items.map(item => ({ ...item, returned: false }));
  return insertRow<Purchase>('purchases', { ...purchase, id: generatedId, items: itemsToSave });
}

export async function addPreSalePurchase(purchase: NewPurchase): Promise<Purchase> {
  const firstItemInitial = purchase.items.length > 0
    ? purchase.items[0].name.charAt(0).toUpperCase().replace(/[^A-Z]/g, 'X')
    : 'X';

  const productMap = await getProductsByIds(purchase.items.map(item => item.id));

  for (const item of purchase.items) {
    if (!productMap.has(item.id)) {
      throw new Error(`Producto con ID ${item.id} no encontrado.`);
    }
  }

  const next = await getNextCounter('preSaleCounter');
  const generatedId = `PV${firstItemInitial}${String(next).padStart(4, '0')}`;

  await Promise.all(purchase.items.map(item => {
    const product = productMap.get(item.id)!;
    return patchProduct(item.id, { preSaleSold: (product.preSaleSold ?? 0) + item.quantity });
  }));

  const itemsToSave = purchase.items.map(item => ({ ...item, returned: false }));
  return insertRow<Purchase>('purchases', { ...purchase, id: generatedId, items: itemsToSave, status: 'pre-sale' });
}

export async function updatePurchase(purchaseId: string, data: Partial<Purchase>): Promise<void> {
  await updateById<Purchase>('purchases', purchaseId, data);
}

export async function cancelPurchaseAndUpdateStock(purchaseId: string): Promise<void> {
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) throw new Error("Purchase not found");

  const productMap = await getProductsByIds(purchase.items.map(item => item.id));
  await Promise.all(purchase.items.map(item => {
    const product = productMap.get(item.id);
    if (!product) throw new Error(`Producto ${item.id} no encontrado.`);
    return patchProduct(item.id, { stock: product.stock + item.quantity });
  }));

  await updateById<Purchase>('purchases', purchaseId, { status: 'cancelled' });
}

export async function updatePendingPurchase(purchaseId: string, newCart: Omit<CartItem, 'returned'>[]): Promise<void> {
  const originalPurchase = await getPurchaseById(purchaseId);
  if (!originalPurchase || (originalPurchase.status !== 'pending' && originalPurchase.status !== 'pre-sale')) {
    throw new Error("Compra no encontrada o ya ha sido procesada.");
  }

  const originalItems = originalPurchase.items;
  const isPreSale = originalPurchase.id.startsWith('PV');
  const originalItemMap = new Map(originalItems.map(item => [item.id, item.quantity]));
  const newItemMap = new Map(newCart.map(item => [item.id, item.quantity]));
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

  const newTotal = newCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemsToSave = newCart.map(item => ({ ...item, returned: false }));

  await updateById<Purchase>('purchases', purchaseId, {
    items: itemsToSave,
    total: newTotal,
    date: new Date().toLocaleString('es-CO'),
  });

  await addAuditLog({
    userId: originalPurchase.cedula,
    userName: `Cliente (Autogestión)`,
    action: 'PURCHASE_EDIT',
    details: `Cliente modificó la compra pendiente ${purchaseId}.`,
  });
}

export async function confirmPreSaleAndUpdateStock(purchaseId: string, currentUser: User): Promise<void> {
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) throw new Error("Preventa no encontrada.");
  if (purchase.status !== 'pre-sale') throw new Error("Esta preventa ya ha sido confirmada o procesada.");

  const productMap = await getProductsByIds(purchase.items.map(item => item.id));
  await Promise.all(purchase.items.map(item => {
    const product = productMap.get(item.id);
    if (!product) throw new Error(`Producto ${item.id} no encontrado.`);
    return patchProduct(item.id, { stock: product.stock + item.quantity });
  }));

  await updateById<Purchase>('purchases', purchaseId, { status: 'pre-sale-confirmed' });

  await addAuditLog({
    userId: currentUser.id,
    userName: currentUser.name,
    action: 'STOCK_RESTOCK',
    details: `Preventa ${purchaseId} confirmada. Stock actualizado.`,
  });
}
