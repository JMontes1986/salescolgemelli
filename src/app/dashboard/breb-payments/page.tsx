"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Landmark, RefreshCw, XCircle } from "lucide-react";
import type { PaymentTransaction } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

function maskPhone(value = "") { return value.length >= 4 ? `${value.slice(0, 3)}*****${value.slice(-2)}` : "No disponible"; }

export default function BrebPaymentsPage() {
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const { toast } = useToast();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dashboard/breb-payments", { cache: "no-store", credentials: "include" });
      const body = await response.json() as { payments?: PaymentTransaction[]; message?: string };
      if (!response.ok) throw new Error(body.message);
      setPayments(body.payments ?? []);
    } catch (error) { toast({ variant: "destructive", title: "No se pudieron cargar los pagos", description: error instanceof Error ? error.message : "Intente nuevamente." }); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const act = async (payment: PaymentTransaction, action: "verify" | "reject") => {
    if (action === "verify" && !window.confirm(`¿Confirma que verificó el ingreso de ${formatCurrency(payment.amount)} correspondiente a ${payment.purchase_id} en la cuenta del colegio?`)) return;
    if (action === "reject" && !window.confirm(`¿Confirma que no encontró el pago de ${payment.purchase_id}? La compra no será cancelada.`)) return;
    setWorking(payment.id);
    try {
      const response = await fetch("/api/dashboard/breb-payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ paymentId: payment.id, action }) });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message);
      setPayments(current => current.filter(item => item.id !== payment.id));
      toast({ title: action === "verify" ? "Pago verificado" : "Pago rechazado", description: action === "verify" ? "La compra quedó pagada y el inventario se aplicó una sola vez." : "La compra continúa pendiente." });
    } catch (error) { toast({ variant: "destructive", title: "No se pudo actualizar", description: error instanceof Error ? error.message : "Intente nuevamente." }); }
    finally { setWorking(null); }
  };

  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-primary">Caja y administración</p><h1 className="text-3xl font-black tracking-tight">Pagos Bre-B por verificar</h1><p className="mt-1 text-muted-foreground">Confirme únicamente después de revisar el ingreso en la cuenta del colegio.</p></div>
      <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
    </header>
    {loading ? <div className="space-y-3" aria-label="Cargando pagos"><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="h-32 animate-pulse rounded-2xl bg-muted" /></div>
      : payments.length === 0 ? <div className="rounded-2xl border border-dashed p-12 text-center"><Landmark className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-bold">No hay pagos pendientes</p><p className="text-sm text-muted-foreground">Los nuevos reportes aparecerán aquí.</p></div>
      : <div className="space-y-4">{payments.map(payment => <Card key={payment.id} className="overflow-hidden rounded-2xl"><CardHeader className="border-b bg-muted/30"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="font-mono text-xl">{payment.purchase_id}</CardTitle><strong className="text-xl">{formatCurrency(payment.amount)}</strong></div></CardHeader><CardContent className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center"><div className="space-y-1 text-sm"><p>Celular: <strong>{maskPhone(payment.purchase?.celular)}</strong></p><p>Reportado: <strong>{payment.reported_at ? new Date(payment.reported_at).toLocaleString("es-CO") : "Sin fecha"}</strong></p><p>Productos: <strong>{payment.purchase?.items.map(item => `${item.quantity} × ${item.name}`).join(", ") || "No disponibles"}</strong></p></div><div className="grid gap-2 sm:grid-cols-2"><Button className="bg-emerald-700 text-white" disabled={working === payment.id} onClick={() => void act(payment, "verify")}><CheckCircle2 className="mr-2 h-4 w-4" />Confirmar pago</Button><Button variant="destructive" disabled={working === payment.id} onClick={() => void act(payment, "reject")}><XCircle className="mr-2 h-4 w-4" />No se encontró</Button></div></CardContent></Card>)}</div>}
  </main>;
}
