import { insertRow, selectRows, selectSingle, updateById, upsertRow } from "@/lib/supabase";
import type { Product, User, ProductAvailability } from "@/lib/types";
import { addAuditLog } from "./audit-service";

export type NewProduct = Omit<Product, 'id' | 'position'>;
export type UpdatableProduct = Partial<Omit<Product, 'id'>>;

const fallbackAvailability: ProductAvailability[] = ['pos', 'self-service', 'presale'];
const missingAvailabilitySchemaMessage =
  'Falta la columna availability en la tabla products. Ejecuta supabase/schema.sql en Supabase para habilitar Venta, Preventa y Autogestion por producto.';

function normalizeProduct(product: Product): Product {
  const hasAvailabilityColumn = Object.prototype.hasOwnProperty.call(product, 'availability');

  return {
    ...product,
    availability: Array.isArray(product.availability)
      ? product.availability
      : product.availability
        ? [product.availability]
        : hasAvailabilityColumn
          ? []
          : fallbackAvailability,
    position: product.position ?? 0,
    restockCount: product.restockCount ?? 0,
    preSaleSold: product.preSaleSold ?? 0,
  };
}

function isMissingPositionColumn(error: unknown) {
  return error instanceof Error && error.message.includes('products.position does not exist');
}

function isMissingAvailabilityColumn(error: unknown) {
  return error instanceof Error && (
    error.message.includes("'availability' column of 'products'") ||
    error.message.includes('products.availability does not exist')
  );
}

function withoutPosition<T extends Partial<Product>>(product: T): Omit<T, 'position'> {
  const { position, ...rest } = product;
  return rest;
}

async function withProductSchemaFallback<T extends Partial<Product>, R>(
  product: T,
  write: (product: Partial<Product>) => Promise<R>
): Promise<R> {
  let payload: Partial<Product> = product;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await write(payload);
    } catch (error) {
      if (isMissingPositionColumn(error) && payload.position !== undefined) {
        payload = withoutPosition(payload);
        continue;
      }

      if (isMissingAvailabilityColumn(error) && payload.availability !== undefined) {
        throw new Error(missingAvailabilitySchemaMessage);
      }

      throw error;
    }
  }

  return write(payload);
}

export async function getProducts(): Promise<Product[]> {
  let products: Product[];

  try {
    products = await selectRows<Product>('products', { order: 'position.asc' });
  } catch (error) {
    if (!isMissingPositionColumn(error)) {
      throw error;
    }

    products = await selectRows<Product>('products', { order: 'name.asc' });
  }

  return products.map(normalizeProduct).sort((a, b) => a.position - b.position);
}

export async function getProductsByAvailability(availability: ProductAvailability): Promise<Product[]> {
  let products: Product[];

  try {
    products = await selectRows<Product>('products', {
      availability: `cs.{${availability}}`,
      order: 'position.asc',
    });
  } catch (error) {
    if (isMissingAvailabilityColumn(error)) {
      return getProducts();
    }

    if (!isMissingPositionColumn(error)) {
      throw error;
    }

    try {
      products = await selectRows<Product>('products', {
        availability: `cs.{${availability}}`,
        order: 'name.asc',
      });
    } catch (fallbackError) {
      if (isMissingAvailabilityColumn(fallbackError)) {
        return getProducts();
      }

      throw fallbackError;
    }
  }

  return products.map(normalizeProduct).sort((a, b) => a.position - b.position);
}

export async function addProduct(product: NewProduct): Promise<Product> {
  const products = await selectRows<Product>('products', { select: 'id' });
  const newPosition = products.length;
  const newProduct = {
    ...product,
    restockCount: 0,
    preSaleSold: 0,
    position: newPosition,
  };

  return normalizeProduct(await withProductSchemaFallback(newProduct, (payload) => insertRow<Product>('products', payload)));
}

export async function addProductWithId(product: Product): Promise<void> {
  const normalized = normalizeProduct(product);

  await withProductSchemaFallback(normalized, (payload) => upsertRow<Product>('products', payload));
}

export async function updateProduct(productId: string, product: UpdatableProduct): Promise<void> {
  await withProductSchemaFallback(product, (payload) => updateById<Product>('products', productId, payload));
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
  try {
    await Promise.all(products.map((product, index) => updateById<Product>('products', product.id, { position: index })));
  } catch (error) {
    if (!isMissingPositionColumn(error)) {
      throw error;
    }
  }
}
