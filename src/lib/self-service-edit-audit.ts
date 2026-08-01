import type { CartItem } from "@/lib/types";

export const SELF_SERVICE_EDIT_AUDIT_PREFIX = "SELF_SERVICE_EDIT_V1:";

export type SelfServiceEditAuditPayload = {
  purchaseId: string;
  beforeTotal: number;
  afterTotal: number;
  beforeItems: CartItem[];
  afterItems: CartItem[];
};

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CartItem>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.price === "number" &&
    typeof item.quantity === "number"
  );
}

export function createSelfServiceEditAuditDetails(
  payload: SelfServiceEditAuditPayload,
): string {
  return `${SELF_SERVICE_EDIT_AUDIT_PREFIX}${JSON.stringify(payload)}`;
}

export function parseSelfServiceEditAuditDetails(
  details: string,
): SelfServiceEditAuditPayload | null {
  if (!details.startsWith(SELF_SERVICE_EDIT_AUDIT_PREFIX)) return null;

  try {
    const parsed = JSON.parse(
      details.slice(SELF_SERVICE_EDIT_AUDIT_PREFIX.length),
    ) as Partial<SelfServiceEditAuditPayload>;

    if (
      typeof parsed.purchaseId !== "string" ||
      typeof parsed.beforeTotal !== "number" ||
      typeof parsed.afterTotal !== "number" ||
      !Array.isArray(parsed.beforeItems) ||
      !parsed.beforeItems.every(isCartItem) ||
      !Array.isArray(parsed.afterItems) ||
      !parsed.afterItems.every(isCartItem)
    ) {
      return null;
    }

    return parsed as SelfServiceEditAuditPayload;
  } catch {
    return null;
  }
}