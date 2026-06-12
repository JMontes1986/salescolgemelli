"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShoppingCart, UserCog, Clock3 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { AuditLog, Product, Purchase } from "@/lib/types";
import { getProducts } from "@/lib/services/product-service";
import { getPurchases } from "@/lib/services/purchase-service";
import { getAuditLogs } from "@/lib/services/audit-service";
import { useToast } from "@/hooks/use-toast";

function getPurchaseChannel(purchase: Purchase): string {
  if (!purchase.sellerId) {
    return purchase.status.startsWith("pre-sale") ? "Preventa autogestionada" : "Autogestión";
  }

  if (purchase.status === "pre-sale" || purchase.status === "pre-sale-confirmed") {
    return "Preventa";
  }

  return "Venta";
}

function getRedemptionLabel(purchase: Purchase): string {
  if (purchase.status === "delivered") {
    return "Entregado";
  }

  if (purchase.status === "partially-delivered") {
    return "Entrega parcial";
  }

  return "Pendiente";
}

function formatPurchaseDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ProductPurchasersClientProps = {
  productId: string;
};

export default function ProductPurchasersClient({ productId }: ProductPurchasersClientProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      try {
        const [allProducts, allPurchases, allAuditLogs] = await Promise.all([
          getProducts(),
          getPurchases(),
          getAuditLogs(),
        ]);
        if (!isMounted) return;
        setProduct(allProducts.find((item) => item.id === productId) ?? null);
        setPurchases(allPurchases);
        setAuditLogs(allAuditLogs);
      } catch (error) {
        console.error("Error loading product purchases:", error);
        toast({ variant: "destructive", title: "Error", description: "No se pudo cargar la información de producto." });
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [productId, toast]);

  const filteredPurchases = useMemo(() => {
    return purchases
      .map((purchase) => {
        const item = purchase.items.find((item) => item.id === productId);
        if (!item) return null;
        return { purchase, item };
      })
      .filter(Boolean) as { purchase: Purchase; item: { id: string; name: string; price: number; quantity: number } }[];
  }, [purchases, productId]);

  const totalSold = filteredPurchases.reduce((sum, entry) => sum + entry.item.quantity, 0);
  const totalRevenue = filteredPurchases.reduce((sum, entry) => sum + entry.item.quantity * entry.item.price, 0);

  const redemptionTimes = useMemo(() => {
    const map = new Map<string, string>();
    const purchaseIdPattern = /compra\s+([0-9A-Za-z_-]+)\./i;

    auditLogs.forEach((log) => {
      if (log.action !== "TICKET_REDEEM") return;
      const match = purchaseIdPattern.exec(log.details);
      if (!match) return;
      const purchaseId = match[1];
      if (!map.has(purchaseId)) {
        map.set(purchaseId, formatPurchaseDate(log.timestamp));
      }
    });

    return map;
  }, [auditLogs]);

  return (
    <div className="w-full space-y-6 px-4 py-8 sm:px-6 xl:px-8">
      <PageHeader
        title="Compradores del producto"
        description={`Productos vendidos e historial de compras para ${product?.name ?? productId}.`}
      >
        <Link href="/dashboard/products">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Button>
        </Link>
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShoppingCart className="h-4 w-4" />
              <span>Producto</span>
            </div>
            <CardTitle>{product?.name ?? "Producto no encontrado"}</CardTitle>
            <p className="text-sm text-muted-foreground">ID: {productId}</p>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <div className="rounded-2xl bg-secondary p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Total vendido</p>
              <p className="mt-1 text-2xl font-semibold">{totalSold.toLocaleString("es-CO")}</p>
            </div>
            <div className="rounded-2xl bg-secondary p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Ingresos asociados</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm md:col-span-2">
          <CardHeader className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserCog className="h-4 w-4" />
              <span>Historial de compras</span>
            </div>
            <CardTitle>{filteredPurchases.length} registros encontrados</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4" />
                <span>
                  La hora de canje no siempre está registrada en el pedido. Se muestra el estado actual y el tipo de compra.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Compradores y operaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-28 flex items-center justify-center text-sm text-muted-foreground">Cargando registros...</div>
          ) : filteredPurchases.length === 0 ? (
            <div className="h-28 flex items-center justify-center text-sm text-muted-foreground">No se han registrado compras para este producto.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha de compra</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Vendedor / Cliente</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Estado de canje</TableHead>
                    <TableHead className="text-right">Hora de canje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases.map(({ purchase, item }) => (
                    <TableRow key={`${purchase.id}-${item.id}`}>
                      <TableCell>{formatPurchaseDate(purchase.date)}</TableCell>
                      <TableCell>{getPurchaseChannel(purchase)}</TableCell>
                      <TableCell>{purchase.sellerName || purchase.cedula}</TableCell>
                      <TableCell>{item.quantity.toLocaleString("es-CO")}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.price * item.quantity)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="capitalize">
                          {getRedemptionLabel(purchase)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {redemptionTimes.get(purchase.id) ?? (purchase.status === "delivered" || purchase.status === "partially-delivered" ? "No registrado" : "-")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
