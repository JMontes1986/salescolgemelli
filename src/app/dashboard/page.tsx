
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  ArrowDown,
  ArrowUp,
  Download,
  RefreshCw,
  ShoppingCart,
  Store,
  Undo2,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Purchase, Product, Return } from "@/lib/types";
import { getPurchases } from "@/lib/services/purchase-service";
import { getProducts } from "@/lib/services/product-service";
import { getReturns } from "@/lib/services/return-service";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const statusTranslations: Record<Purchase['status'], string> = {
    pending: 'Pendiente',
    paid: 'Pagado',
    delivered: 'Entregado',
    cancelled: 'Cancelado',
    'pre-sale': 'Preventa Pendiente',
    'pre-sale-confirmed': 'Preventa Confirmada',
};

const statusColors: Record<Purchase['status'], string> = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    delivered: 'border-sky-200 bg-sky-50 text-sky-700',
    cancelled: 'border-rose-200 bg-rose-50 text-rose-700',
    'pre-sale': 'border-violet-200 bg-violet-50 text-violet-700',
    'pre-sale-confirmed': 'border-teal-200 bg-teal-50 text-teal-700',
};

type ProductSales = {
    [productId: string]: {
        name: string;
        grossQuantity: number;
        grossRevenue: number;
        returnedQuantity: number;
        returnedRevenue: number;
        netQuantity: number;
        netRevenue: number;
    }
}

type SellerSales = {
    [sellerId: string]: {
        name: string;
        totalRevenue: number;
        transactionCount: number;
    }
}

function KpiCard({
  title,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 p-4 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`rounded-md p-2 ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1 p-4 pt-0">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <p className="text-xs leading-5 text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}

function formatDashboardDate(date: string) {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

export default function Dashboard() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [returns, setReturns] = useState<Return[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedPurchases, fetchedProducts, fetchedReturns] = await Promise.all([
        getPurchases(),
        getProducts(),
        getReturns(),
      ]);
      setPurchases(fetchedPurchases);
      setProducts(fetchedProducts);
      setReturns(fetchedReturns);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los datos del panel." });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const paidPurchases = purchases.filter((p) => p.status === "paid" || p.status === "delivered");
  const totalRevenue = paidPurchases.reduce((sum, p) => sum + p.total, 0);
  const soldItemCount = paidPurchases.flatMap(p => p.items).reduce((sum, item) => sum + item.quantity, 0);
  const averageTicket = paidPurchases.length > 0 ? totalRevenue / paidPurchases.length : 0;
  
  const selfServicePurchases = paidPurchases.filter(p => !p.sellerId);

  const selfServiceRevenue = selfServicePurchases.reduce((sum, p) => sum + p.total, 0);

  const selfServiceUsers = new Set(selfServicePurchases.map(p => p.cedula)).size;

  const activeSellers = new Set(paidPurchases.map(p => p.sellerId).filter(Boolean)).size;
  
  const totalReturnedItems = returns.reduce((sum, r) => sum + r.quantity, 0);

    const productSales = paidPurchases
        .flatMap(p => p.items)
        .reduce((acc, item) => {
            if (!acc[item.id]) {
                const product = products.find(p => p.id === item.id);
                acc[item.id] = { 
                    name: product?.name || item.name, 
                    grossQuantity: 0, 
                    grossRevenue: 0,
                    returnedQuantity: 0,
                    returnedRevenue: 0,
                    netQuantity: 0,
                    netRevenue: 0,
                };
            }
            acc[item.id].grossQuantity += item.quantity;
            acc[item.id].grossRevenue += item.price * item.quantity;
            return acc;
        }, {} as ProductSales);

    returns.forEach(returnedItem => {
        if (productSales[returnedItem.productId]) {
            const product = products.find(p => p.id === returnedItem.productId);
            const pricePerItem = product ? product.price : 0;
            productSales[returnedItem.productId].returnedQuantity += returnedItem.quantity;
            productSales[returnedItem.productId].returnedRevenue += returnedItem.quantity * pricePerItem;
        }
    });

    Object.values(productSales).forEach(data => {
        data.netQuantity = data.grossQuantity - data.returnedQuantity;
        data.netRevenue = data.grossRevenue - data.returnedRevenue;
    });


  const sortedProductSales = Object.entries(productSales).sort(([,a],[,b]) => b.netRevenue - a.netRevenue);
  const maxProductRevenue = sortedProductSales[0]?.[1].netRevenue || 1;
  const netRevenue = Object.values(productSales).reduce((sum, product) => sum + product.netRevenue, 0);

  const sellerSales = paidPurchases
    .filter(p => p.sellerId)
    .reduce((acc, p) => {
        if (p.sellerId) {
            if (!acc[p.sellerId]) {
                acc[p.sellerId] = {
                    name: p.sellerName || 'Desconocido',
                    totalRevenue: 0,
                    transactionCount: 0
                };
            }
            acc[p.sellerId].totalRevenue += p.total;
            acc[p.sellerId].transactionCount += 1;
        }
        return acc;
    }, {} as SellerSales);

  const sortedSellerSales = Object.entries(sellerSales).sort(([,a],[,b]) => b.totalRevenue - a.totalRevenue);
  const recentPurchases = [...purchases]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  const handleExportCSV = () => {
    if (sortedProductSales.length === 0) {
        toast({
            variant: "destructive",
            title: "No hay datos",
            description: "No hay datos de ventas por producto para exportar."
        });
        return;
    }

    const headers = ["Producto", "Cantidad Vendida (Neta)", "Ingresos (COP)"];
    const rows = sortedProductSales.map(([, data]) => [
        `"${data.name.replace(/"/g, '""')}"`,
        data.netQuantity,
        data.netRevenue
    ]);

    let csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n" 
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ventas_por_producto.csv");
    document.body.appendChild(link);

    link.click();
    document.body.removeChild(link);
};


  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Panel de Control"
        description="Resumen operativo para ventas, autogestión, devoluciones y rendimiento del equipo."
      >
        <Button variant="outline" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Actualizando...' : 'Actualizar'}
        </Button>
      </PageHeader>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Ingresos netos"
          value={formatCurrency(sortedProductSales.length > 0 ? netRevenue : totalRevenue)}
          caption={`${paidPurchases.length} ventas pagadas, ticket promedio ${formatCurrency(averageTicket)}`}
          icon={Store}
          tone="bg-emerald-50 text-emerald-700"
        />
        <KpiCard
          title="Autogestión"
          value={formatCurrency(selfServiceRevenue)}
          caption={`${selfServiceUsers} clientes únicos compraron en el portal`}
          icon={UserCog}
          tone="bg-sky-50 text-sky-700"
        />
        <KpiCard
          title="Artículos vendidos"
          value={soldItemCount.toLocaleString("es-CO")}
          caption={`${totalReturnedItems} artículos fueron devueltos al inventario`}
          icon={ShoppingCart}
          tone="bg-amber-50 text-amber-700"
        />
        <KpiCard
          title="Equipo activo"
          value={activeSellers.toLocaleString("es-CO")}
          caption="Vendedores con transacciones confirmadas"
          icon={Users}
          tone="bg-violet-50 text-violet-700"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Rendimiento por producto</CardTitle>
              <CardDescription>
                Ventas, devoluciones e ingresos netos para priorizar stock y reposición.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {isLoading ? (
              <div className="flex h-28 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                Calculando ventas...
              </div>
            ) : sortedProductSales.length === 0 ? (
              <div className="flex h-28 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No hay productos vendidos todavía.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedProductSales.slice(0, 8).map(([productId, data]) => (
                  <div key={productId} className="rounded-md border bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{data.name}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
                          <span className="inline-flex items-center text-emerald-700">
                            <ArrowUp className="mr-1 h-4 w-4" />
                            {data.grossQuantity} vendidos
                          </span>
                          <span className="inline-flex items-center text-rose-700">
                            <ArrowDown className="mr-1 h-4 w-4" />
                            {data.returnedQuantity} devueltos
                          </span>
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-sm text-muted-foreground">Neto</p>
                        <p className="text-lg font-semibold">{formatCurrency(data.netRevenue)}</p>
                      </div>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(6, Math.min(100, (data.netRevenue / maxProductRevenue) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-5">
            <CardTitle className="text-lg font-semibold">Lectura rápida</CardTitle>
            <CardDescription>Indicadores para revisar antes de operar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <div className="rounded-md bg-secondary p-4">
              <p className="text-sm text-muted-foreground">Ventas confirmadas</p>
              <p className="mt-1 text-2xl font-semibold">{paidPurchases.length.toLocaleString("es-CO")}</p>
            </div>
            <div className="rounded-md bg-secondary p-4">
              <p className="text-sm text-muted-foreground">Ingreso bruto</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="rounded-md bg-secondary p-4">
              <p className="text-sm text-muted-foreground">Productos con movimiento</p>
              <p className="mt-1 text-2xl font-semibold">{sortedProductSales.length.toLocaleString("es-CO")}</p>
            </div>
            <div className="flex items-start gap-3 rounded-md border p-4">
              <Undo2 className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium">Devoluciones registradas</p>
                <p className="text-sm text-muted-foreground">
                  {totalReturnedItems.toLocaleString("es-CO")} artículos volvieron al stock.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Ventas por vendedor</CardTitle>
            <CardDescription>
              Rendimiento del equipo en caja.
            </CardDescription>
          </CardHeader>
          <CardContent>
             {isLoading ? (
                <div className="h-24 text-center flex items-center justify-center">Calculando...</div>
            ) : (
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Ventas</TableHead>
                    <TableHead className="text-right">Ingresos (COP)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedSellerSales.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={3} className="h-24 text-center">
                                No hay ventas registradas por vendedores.
                            </TableCell>
                        </TableRow>
                    ) : (
                        sortedSellerSales.map(([sellerId, data]) => (
                        <TableRow key={sellerId}>
                            <TableCell className="font-medium">{data.name}</TableCell>
                            <TableCell>{data.transactionCount}</TableCell>
                            <TableCell className="text-right">{formatCurrency(data.totalRevenue)}</TableCell>
                        </TableRow>
                        ))
                    )}
                </TableBody>
                </Table>
            )}
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Ventas recientes</CardTitle>
            <CardDescription>
              Ultimas transacciones registradas en el sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
             {isLoading ? (
                <div className="h-24 text-center flex items-center justify-center">Cargando ventas...</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>ID de Compra</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Vendedor/Cliente</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {recentPurchases.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                                No hay ventas recientes.
                            </TableCell>
                        </TableRow>
                    ) : (
                        recentPurchases.map((purchase) => (
                        <TableRow key={purchase.id}>
                            <TableCell className="font-medium font-mono">{purchase.id}</TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {formatDashboardDate(purchase.date)}
                            </TableCell>
                            <TableCell>
                            <Badge
                                variant="outline"
                                className={`whitespace-nowrap ${statusColors[purchase.status]}`}
                            >
                                {statusTranslations[purchase.status]}
                            </Badge>
                            </TableCell>
                            <TableCell>{purchase.sellerName || purchase.cedula}</TableCell>
                            <TableCell className="text-right">
                            {formatCurrency(purchase.total)}
                            </TableCell>
                        </TableRow>
                        ))
                    )}
                </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
