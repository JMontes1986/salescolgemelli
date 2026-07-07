"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  FileText,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Store,
  Undo2,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { Purchase, Product, Return } from "@/lib/types";
import { getPurchases } from "@/lib/services/purchase-service";
import { getProducts } from "@/lib/services/product-service";
import { getReturns } from "@/lib/services/return-service";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const statusTranslations: Record<Purchase['status'], string> = {
    pending: 'Pendiente',
    paid: 'Pagado',
    delivered: 'Entregado',
    'partially-delivered': 'Entrega parcial',
    cancelled: 'Cancelado',
    'pre-sale': 'Preventa Pendiente',
    'pre-sale-confirmed': 'Preventa Confirmada',
};

const statusColors: Record<Purchase['status'], string> = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    delivered: 'border-sky-200 bg-sky-50 text-sky-700',
    'partially-delivered': 'border-emerald-200 bg-emerald-50 text-emerald-700',
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


type ReportChartData = {
  label: string;
  value: number;
  displayValue: string;
};


function KpiCard({
  title,
  value,
  caption,
  icon: Icon,
  tone,
  active = false,
}: {
  title: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  tone: string;
  active?: boolean;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-slate-200 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl",
        active && "scale-[1.01]"
      )}
    >
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

function formatReportDate(date = new Date()) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
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
  const [activeSection, setActiveSection] = useState<'dashboard' | 'sales' | 'presales' | 'selfService'>('dashboard');
  const [mollyReportText, setMollyReportText] = useState('');
  const router = useRouter();
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

  const presalePurchases = purchases.filter((purchase) => purchase.status === 'pre-sale' || purchase.status === 'pre-sale-confirmed');
  const allSelfServicePurchases = purchases.filter((purchase) => !purchase.sellerId);

  const recentPurchases = [...purchases]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);
  const recentSelfServicePurchases = [...allSelfServicePurchases]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);
  const presaleRevenue = presalePurchases.reduce((sum, purchase) => sum + purchase.total, 0);
  const selfServicePending = allSelfServicePurchases.filter((purchase) => purchase.status === 'pending').length;

  const dashboardProgress = totalRevenue > 0 ? Math.round((selfServiceRevenue / totalRevenue) * 100) : 0;
  const progressCircumference = 2 * Math.PI * 24;
  const progressStrokeOffset = progressCircumference - (progressCircumference * dashboardProgress) / 100;
  const reportGeneratedAt = formatReportDate();

  const reportChartData: ReportChartData[] = [
    { label: 'Ingresos netos', value: sortedProductSales.length > 0 ? netRevenue : totalRevenue, displayValue: formatCurrency(sortedProductSales.length > 0 ? netRevenue : totalRevenue) },
    { label: 'Autogestión', value: selfServiceRevenue, displayValue: formatCurrency(selfServiceRevenue) },
    { label: 'Artículos', value: soldItemCount, displayValue: soldItemCount.toLocaleString('es-CO') },
  ];
  const maxReportChartValue = Math.max(...reportChartData.map((item) => item.value), 1);

  const buildMollyReport = () => {
    const bestProduct = topProducts[0]?.[1];
    const reportText = `Informe ejecutivo de ventas — generado por Molly IA el ${reportGeneratedAt}.

Durante el periodo analizado, la operación registra ${paidPurchases.length.toLocaleString('es-CO')} ventas confirmadas, ingresos netos por ${formatCurrency(sortedProductSales.length > 0 ? netRevenue : totalRevenue)} y un ticket promedio de ${formatCurrency(averageTicket)}. La autogestión aporta ${formatCurrency(selfServiceRevenue)}, equivalente al ${dashboardProgress}% de los ingresos confirmados, con ${selfServiceUsers.toLocaleString('es-CO')} clientes únicos.

La lectura operativa muestra ${soldItemCount.toLocaleString('es-CO')} artículos vendidos y ${totalReturnedItems.toLocaleString('es-CO')} devoluciones registradas. ${bestProduct ? `El producto con mayor aporte neto es ${bestProduct.name}, con ${formatCurrency(bestProduct.netRevenue)}.` : 'Aún no existe un producto líder porque no hay ventas consolidadas.'}

Recomendación Molly IA: mantener seguimiento diario a los productos de mayor rotación, revisar las devoluciones registradas y reforzar el canal de autogestión para sostener el crecimiento sin cargar al equipo de caja.`;

    setMollyReportText(reportText);
  };

  const topProducts = sortedProductSales.slice(0, 3);
  const handleProductClick = useCallback((productId: string) => {
   router.push(`/dashboard/products/${encodeURIComponent(productId)}`);
  }, [router]);
 
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
    <div className="min-h-screen w-full space-y-6 bg-background px-4 py-8 text-foreground transition-colors duration-500 sm:px-6 xl:px-8">
      <div className="w-full space-y-6 rounded-3xl border border-border bg-card p-6 shadow-sm transition-all duration-300">
        <PageHeader
          title="Panel de Control"
          description="Resumen operativo para ventas, autogestión, devoluciones y rendimiento del equipo."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={loadData} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              {isLoading ? "Actualizando..." : "Actualizar"}
            </Button>
          </div>
        </PageHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-full border bg-background/80 px-1 py-1 text-sm shadow-sm">
          {[
            { id: "dashboard", label: "Dashboard" },
            { id: "sales", label: "Ventas" },
            { id: "presales", label: "Preventas" },
            { id: "selfService", label: "Autogestión" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id as typeof activeSection)}
              className={cn(
                "rounded-full px-4 py-2 transition-colors duration-200",
                activeSection === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-xl font-semibold">
                <Sparkles className="h-5 w-5 text-primary" />
                Informe redactado por Molly IA
              </CardTitle>
              <CardDescription>
                Molly IA redacta un informe enfocado en ventas, autogestión y rendimiento operativo del proyecto.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <Button onClick={buildMollyReport} disabled={isLoading}>
                <Sparkles className="mr-2 h-4 w-4" />
                Redactar con Molly IA
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 p-5 pt-0 xl:grid-cols-[1fr_0.7fr]">
            <div className="space-y-3">
              <div className="rounded-2xl border bg-secondary/50 p-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="font-semibold">Resumen de ventas Molly</p>
                    <p className="text-sm text-muted-foreground">Ventas, autogestión, devoluciones y rendimiento operativo.</p>
                  </div>
                </div>
              </div>
              <Textarea
                value={mollyReportText}
                onChange={(event) => setMollyReportText(event.target.value)}
                placeholder="Aquí aparecerá el informe redactado por Molly IA. También puedes ajustarlo antes de visualizar o exportar."
                className="min-h-[220px] resize-y bg-background leading-7"
              />
              <p className="text-xs text-muted-foreground">El PDF incluirá la nota: Redactado por Molly IA.</p>
            </div>
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">Gráfico del informe</p>
                  <p className="text-xs text-muted-foreground">Indicadores principales según el enfoque seleccionado.</p>
                </div>
              </div>
              <div className="space-y-4">
                {reportChartData.map((item) => (
                  <div key={item.label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{item.label}</span>
                      <span className="text-muted-foreground">{item.displayValue}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-sky-400"
                        style={{ width: `${Math.max(8, Math.min(100, (item.value / maxReportChartValue) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {activeSection === "dashboard" && (
          <>
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
              <Card className="border-slate-200 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold">Lectura rápida</CardTitle>
                    <CardDescription>
                      Indicadores clave para revisar antes de operar.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-5 pt-0">
                  <div className="rounded-2xl bg-secondary p-4 shadow-sm">
                    <p className="text-sm text-muted-foreground">Ventas confirmadas</p>
                    <p className="mt-1 text-2xl font-semibold">{paidPurchases.length.toLocaleString("es-CO")}</p>
                  </div>
                  <div className="rounded-2xl bg-secondary p-4 shadow-sm">
                    <p className="text-sm text-muted-foreground">Ingreso bruto</p>
                    <p className="mt-1 text-2xl font-semibold">{formatCurrency(totalRevenue)}</p>
                  </div>
                  <div className="rounded-2xl bg-secondary p-4 shadow-sm">
                    <p className="text-sm text-muted-foreground">Productos con movimiento</p>
                    <p className="mt-1 text-2xl font-semibold">{sortedProductSales.length.toLocaleString("es-CO")}</p>
                  </div>
                  <div className="flex items-start gap-3 rounded-2xl border p-4 shadow-sm">
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

              <Card className="border-slate-200 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold">Resumen de autogestión</CardTitle>
                    <CardDescription>
                      Porcentaje de ingresos que provienen de compras sin vendedor.
                    </CardDescription>
                  </div>
                  <div className="grid place-items-center rounded-3xl bg-primary/10 p-3">
                    <svg width="56" height="56" viewBox="0 0 56 56" className="rotate-[-90deg]">
                      <circle
                        cx="28"
                        cy="28"
                        r="24"
                        fill="none"
                        className="stroke-border"
                        strokeWidth="6"
                      />
                      <circle
                        cx="28"
                        cy="28"
                        r="24"
                        fill="none"
                        stroke="url(#dashboardGradient)"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={progressCircumference}
                        strokeDashoffset={progressStrokeOffset}
                      />
                      <defs>
                        <linearGradient id="dashboardGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#22c55e" />
                          <stop offset="100%" stopColor="#0ea5e9" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-5 pt-0">
                  <div className="rounded-2xl bg-secondary p-4 shadow-sm">
                    <p className="text-sm text-muted-foreground">Ventas autogestionadas</p>
                    <p className="mt-1 text-3xl font-semibold text-primary">{dashboardProgress}%</p>
                  </div>
                  <div className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground shadow-sm">
                    <p>{selfServiceUsers.toLocaleString("es-CO")} clientes únicos completaron compras sin vendedor.</p>
                    <p className="mt-3 text-xs text-muted-foreground">Un dashboard más intuitivo ayuda a identificar oportunidades de crecimiento.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {activeSection === "sales" && (
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="border-slate-200 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
              <CardHeader className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">Rendimiento por producto</CardTitle>
                  <CardDescription>
                    Ventas, devoluciones e ingresos netos para priorizar stock y reposición.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="rounded-3xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100">
                    {topProducts.length} productos principales
                  </div>
                  <Button variant="outline" onClick={handleExportCSV}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar CSV
                  </Button>
                </div>
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
                      <div
                        key={productId}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleProductClick(productId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            handleProductClick(productId);
                          }
                        }}
                        className="cursor-pointer rounded-2xl border bg-card p-4 transition duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
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

            <Card className="border-slate-200 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Ventas recientes</CardTitle>
                <CardDescription>
                  Últimas transacciones registradas en el sistema.
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
                            <TableRow key={purchase.id} className="transition-colors duration-200 hover:bg-muted/60">
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
        )}

        {activeSection === "presales" && (
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="border-slate-200 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Filtro de preventas</CardTitle>
                <CardDescription>
                  Solicitudes de preventa pendientes y confirmadas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-24 text-center flex items-center justify-center">Calculando...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID de compra</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Ingresos (COP)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {presalePurchases.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-24 text-center">
                            No hay preventas registradas.
                          </TableCell>
                        </TableRow>
                      ) : (
                        presalePurchases.map((purchase) => (
                          <TableRow key={purchase.id} className="transition-colors duration-200 hover:bg-muted/60">
                            <TableCell className="font-medium font-mono">{purchase.id}</TableCell>
                            <TableCell>{statusTranslations[purchase.status]}</TableCell>
                            <TableCell className="text-right">{formatCurrency(purchase.total)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Resumen de preventas</CardTitle>
                <CardDescription>
                  Totales filtrados para seguimiento comercial.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Preventas</p><p className="mt-1 text-2xl font-semibold">{presalePurchases.length.toLocaleString("es-CO")}</p></div>
                <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Valor estimado</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(presaleRevenue)}</p></div>
                <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Confirmadas</p><p className="mt-1 text-2xl font-semibold">{presalePurchases.filter((purchase) => purchase.status === 'pre-sale-confirmed').length.toLocaleString("es-CO")}</p></div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === "selfService" && (
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="border-slate-200 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Filtro de autogestión</CardTitle>
                <CardDescription>
                  Compras realizadas desde el portal público sin vendedor asignado.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-24 text-center flex items-center justify-center">Cargando autogestión...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID de compra</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentSelfServicePurchases.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                              No hay compras de autogestión registradas.
                            </TableCell>
                          </TableRow>
                        ) : (
                          recentSelfServicePurchases.map((purchase) => (
                            <TableRow key={purchase.id} className="transition-colors duration-200 hover:bg-muted/60">
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
                              <TableCell>{purchase.cedula}</TableCell>
                              <TableCell className="text-right">{formatCurrency(purchase.total)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Resumen de autogestión</CardTitle>
                <CardDescription>
                  Indicadores filtrados del canal público.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Compras del portal</p><p className="mt-1 text-2xl font-semibold">{allSelfServicePurchases.length.toLocaleString("es-CO")}</p></div>
                <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Ingresos confirmados</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(selfServiceRevenue)}</p></div>
                <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Pendientes por gestionar</p><p className="mt-1 text-2xl font-semibold">{selfServicePending.toLocaleString("es-CO")}</p></div>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
