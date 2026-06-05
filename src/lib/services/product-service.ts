import { insertRow, selectRows, selectSingle, updateById, upsertRow } from "@/lib/supabase";
import type { Product, User, ProductAvailability } from "@/lib/types";
import { addAuditLog } from "./audit-service";

export type NewProduct = Omit<Product, 'id' | 'position'>;
export type UpdatableProduct = Partial<Omit<Product, 'id'>>;

function normalizeProduct(product: Product): Product {
  return {
    ...product,
    availability: Array.isArray(product.availability)
      ? product.availability
      : product.availability
        ? [product.availability]
        : [],
    position: product.position ?? 0,
    restockCount: product.restockCount ?? 0,
    preSaleSold: product.preSaleSold ?? 0,
  };
}

export async function getProducts(): Promise<Product[]> {
  const products = await selectRows<Product>('products', { order: 'position.asc' });
  return products.map(normalizeProduct).sort((a, b) => a.position - b.position);
}

export async function getProductsByAvailability(availability: ProductAvailability): Promise<Product[]> {
  const products = await selectRows<Product>('products', {
    availability: `cs.{${availability}}`,
    order: 'position.asc',
  });
  return products.map(normalizeProduct).sort((a, b) => a.position - b.position);
}

export async function addProduct(product: NewProduct): Promise<Product> {
  const products = await selectRows<Product>('products', { select: 'id' });
  const newPosition = products.length;
  return insertRow<Product>('products', {
    ...product,
    restockCount: 0,
    preSaleSold: 0,
    position: newPosition,
  });
}

export async function addProductWithId(product: Product): Promise<void> {
  const normalized = normalizeProduct(product);
  await upsertRow<Product>('products', normalized);
}

export async function updateProduct(productId: string, product: UpdatableProduct): Promise<void> {
  await updateById<Product>('products', productId, product);
}

export async function increaseProductStock(productId: string, quantity: number, user?: User): Promise<void> {
  const product = await selectSingle<Product>('products', { id: `eq.${productId}` });
  if (!product) {
    throw new Error(`Producto ${productId} no encontrado.`);
  }

  const patch: Partial<Product> = { stock: product.stock + quantity };

  if (user) {
    await addAuditLog({
      userId: user.id,
      userName: user.name,
      action: 'STOCK_RESTOCK',
      details: `Reintegro de stock para '${product.name}'. Cantidad: +${quantity}.`,
    });
    patch.restockCount = (product.restockCount ?? 0) + 1;
  }

  await updateById<Product>('products', productId, patch);
}

export async function updateProductOrder(products: Product[]): Promise<void> {
  await Promise.all(products.map((product, index) => updateById<Product>('products', product.id, { position: index })));
}
