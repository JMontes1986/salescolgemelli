import { insertRow, selectRows, selectSingle, updateById, upsertRow } from "@/lib/supabase";
import type { Product, User, ProductAvailability } from "@/lib/types";
import { addAuditLog } from "./audit-service";

export type NewProduct = Omit<Product, 'id' | 'position'>;
export type UpdatableProduct = Partial<Omit<Product, 'id'>>;

export const allProductAvailability: ProductAvailability[] = ['pos', 'self-service', 'presale'];
export const unavailableProductAvailability: ProductAvailability = 'unavailable';
const fallbackAvailability = allProductAvailability;
const availabilityValues = new Set<ProductAvailability>([...fallbackAvailability, unavailableProductAvailability]);
const missingAvailabilitySchemaMessage =
  'Falta la columna availability en la tabla products. Ejecuta supabase/schema.sql en Supabase para habilitar Venta, Preventa y Autogestion por producto.';
const defaultProductCategory = 'general';
const PRODUCTS_READ_CACHE_TTL_MS = 30_000;

export function normalizeProductAvailability(value: unknown): ProductAvailability[] {
  const rawValues = (() => {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (!trimmed) {
        return [];
      }

      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) ? parsed : [trimmed];
        } catch {
          return [trimmed];
        }
      }

      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return trimmed
          .slice(1, -1)
          .split(',')
          .map(item => item.replace(/^"|"$/g, '').trim())
          .filter(Boolean);
      }

      return [trimmed];
    }

    return [];
  })();

  const normalized = rawValues.reduce<ProductAvailability[]>((acc, item) => {
    if (typeof item !== 'string') {
      return acc;
    }

    const availability = item.trim() as ProductAvailability;
    if (availabilityValues.has(availability) && !acc.includes(availability)) {
      acc.push(availability);
    }

    return acc;
  }, []);

  if (normalized.includes(unavailableProductAvailability)) {
    return [unavailableProductAvailability];
  }

  if (normalized.length > 0) {
    return normalized;
  }

  return [...fallbackAvailability];
}

function normalizeAvailabilityForWrite(value: unknown): ProductAvailability[] {
  return normalizeProductAvailability(value);
}

function normalizeProductPayload<T extends Partial<Product>>(product: T): T {
  const normalizedProduct = {
    ...product,
    category: typeof product.category === 'string' && product.category.trim()
      ? product.category.trim()
      : defaultProductCategory,
  };

  if (!Object.prototype.hasOwnProperty.call(product, 'availability')) {
    return normalizedProduct;
  }

  return {
    ...normalizedProduct,
    availability: normalizeAvailabilityForWrite(product.availability),
  };
}

function normalizeProduct(product: Product): Product {
  return {
    ...product,
    availability: normalizeProductAvailability(product.availability),
    category: product.category || defaultProductCategory,
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

function isMissingCategoryColumn(error: unknown) {
  return error instanceof Error && (
    error.message.includes("'category' column of 'products'") ||
    error.message.includes('products.category does not exist')
  );
}

function withoutPosition<T extends Partial<Product>>(product: T): Omit<T, 'position'> {
  const { position, ...rest } = product;
  return rest;
}

function withoutCategory<T extends Partial<Product>>(product: T): Omit<T, 'category'> {
  const { category, ...rest } = product;
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

      if (isMissingCategoryColumn(error) && payload.category !== undefined) {
        payload = withoutCategory(payload);
        continue;
      }

      throw error;
    }
  }

  return write(payload);
}

export async function getProducts(): Promise<Product[]> {
  let products: Product[];

  try {
    products = await selectRows<Product>('products', { order: 'position.asc' }, undefined, PRODUCTS_READ_CACHE_TTL_MS);
  } catch (error) {
    if (!isMissingPositionColumn(error)) {
      throw error;
    }

    products = await selectRows<Product>('products', { order: 'name.asc' }, undefined, PRODUCTS_READ_CACHE_TTL_MS);
  }

  return products.map(normalizeProduct).sort((a, b) => a.position - b.position);
}

export async function getProductsByAvailability(availability: ProductAvailability): Promise<Product[]> {
  const products = await getProducts();
  return products.filter(product => product.availability.includes(availability));
}

export async function addProduct(product: NewProduct, user?: User): Promise<Product> {
  const products = await selectRows<Product>('products', { select: 'id' });
  const newPosition = products.length;
  const newProduct = normalizeProductPayload({
    ...product,
    restockCount: 0,
    preSaleSold: 0,
    position: newPosition,
  });

  const savedProduct = normalizeProduct(await withProductSchemaFallback(newProduct, (payload) => insertRow<Product>('products', payload)));

  if (user) {
    await addAuditLog({
      userId: user.id,
      userName: user.name,
      action: 'PRODUCT_CREATE',
      details: `Producto '${savedProduct.name}' creado. Stock: ${savedProduct.stock}. Precio: ${savedProduct.price}. Canales: ${savedProduct.availability.join(', ')}.`,
    });
  }

  return savedProduct;
}

export async function addProductWithId(product: Product): Promise<void> {
  const normalized = normalizeProductPayload(normalizeProduct(product));

  await withProductSchemaFallback(normalized, (payload) => upsertRow<Product>('products', payload));
}

export async function updateProduct(productId: string, product: UpdatableProduct, user?: User): Promise<Product> {
  const updatedProduct = await withProductSchemaFallback(
    normalizeProductPayload(product),
    (payload) => updateById<Product>('products', productId, payload)
  );

  if (!updatedProduct) {
    throw new Error('Supabase no confirmó la actualización del producto. Revisa que hayas iniciado sesión y vuelve a ejecutar supabase/schema.sql para aplicar las políticas RLS de la tabla products.');
  }

  const normalizedProduct = normalizeProduct(updatedProduct);

  if (user) {
    await addAuditLog({
      userId: user.id,
      userName: user.name,
      action: 'PRODUCT_UPDATE',
      details: `Producto '${normalizedProduct.name}' actualizado. Stock: ${normalizedProduct.stock}. Precio: ${normalizedProduct.price}. Canales: ${normalizedProduct.availability.join(', ')}.`,
    });
  }

  return normalizedProduct;
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
