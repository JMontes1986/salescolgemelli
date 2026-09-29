import type { PaymentTransaction } from "@/lib/types";

export async function reportBrebPayment(purchaseId: string): Promise<PaymentTransaction> {
  const response = await fetch("/api/self-service/payments/report", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", cache: "no-store",
    body: JSON.stringify({ purchaseId }),
  });
  const body = await response.json().catch(() => null) as { payment?: PaymentTransaction; message?: string } | null;
  if (!response.ok || !body?.payment) throw new Error(body?.message || "No se pudo reportar el pago.");
  return body.payment;
}
