import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  HandCoins,
  PackageCheck,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  WalletCards,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const quickLinks = [
  { href: "/dashboard/cashbox", label: "Ir a Caja", icon: WalletCards },
  { href: "/dashboard/sales", label: "Ir a Ventas", icon: ShoppingCart },
  { href: "/dashboard/redeem", label: "Validar Autogestión", icon: ClipboardCheck },
  { href: "/dashboard/returns", label: "Ir a Devoluciones", icon: RotateCcw },
];

const saleSteps = [
  "Confirme que la caja esté abierta antes de iniciar ventas del turno.",
  "En Punto de Venta, busque el producto y pulse Agregar las veces necesarias.",
  "Revise cantidades, subtotal y disponibilidad antes de cobrar.",
  "Ingrese el efectivo recibido en el campo Cliente para ver la devolución.",
  "Si el comprador quiere historial por cédula, registre la cédula antes de finalizar.",
  "Pulse Comprar solo después de recibir el pago y entregar el cambio correcto.",
];

const returnSteps = [
  "Verifique físicamente que el producto sí fue devuelto y está apto para volver al inventario.",
  "Abra Devoluciones y seleccione el producto exacto.",
  "Marque si el origen fue Punto de Venta o Autogestión.",
  "Ingrese la cantidad devuelta y revise el stock después de la devolución.",
  "Pulse Confirmar Devolución y valide que aparezca en Última Devolución e Historial.",
];

const selfServiceSteps = [
  "Pida al acudiente el código de compra o busque la compra pendiente desde Ventas.",
  "Abra Gestión entrega o pulse Verificar en Compras de Autogestión Pendientes.",
  "Confirme cédula, productos, cantidades, total y estado de pago antes de entregar.",
  "Si está pendiente de pago en caja, cobre primero y luego registre la validación/entrega.",
  "Entregue únicamente los productos que aparecen en la compra validada.",
  "Si el acudiente desiste, use Cancelar para liberar la disponibilidad reservada.",
];

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={item} className="flex gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {index + 1}
          </span>
          <span className="text-sm leading-6 text-muted-foreground">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function AlertBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <p className="mb-1 flex items-center gap-2 font-semibold">
        <ShieldCheck className="h-4 w-4" />
        {title}
      </p>
      <div className="text-sm leading-6">{children}</div>
    </div>
  );
}

export default function CashierTutorialPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Tutorial para Cajas" description="Guía rápida para vender, procesar devoluciones y validar compras de autogestión." />

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Badge className="mb-3" variant="secondary">Capacitación operativa</Badge>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <BookOpenCheck className="h-7 w-7 text-primary" />
                Flujo recomendado para cada turno
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl">
                Use esta pantalla como lista de verificación. Primero abra caja, luego registre ventas o valide autogestiones, y al final cierre caja con el efectivo contado.
              </CardDescription>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {quickLinks.map((item) => (
                <Button key={item.href} asChild variant="outline" className="justify-start bg-background">
                  <Link href={item.href}>
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-primary" />1. Apertura y cierre de caja</CardTitle><CardDescription>Base obligatoria para controlar el efectivo del turno.</CardDescription></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-muted-foreground"><p><strong className="text-foreground">Abrir:</strong> ingrese el saldo inicial real y pulse Abrir Caja. No use valores estimados.</p><p><strong className="text-foreground">Durante el turno:</strong> registre todas las ventas por sistema antes de entregar productos.</p><p><strong className="text-foreground">Cerrar:</strong> cuente el efectivo, ingrese el saldo de cierre y revise el descuadre antes de confirmar.</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-primary" />2. Control de soportes</CardTitle><CardDescription>Evita errores entre ventas, autogestión y devoluciones.</CardDescription></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-muted-foreground"><p>Confirme producto, cantidad y total en voz alta con el comprador.</p><p>Si una compra viene de autogestión, valide código y cédula antes de entregar.</p><p>En devoluciones, registre siempre el origen correcto para que el historial sea confiable.</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" />3. Buenas prácticas</CardTitle><CardDescription>Reglas simples para proteger caja e inventario.</CardDescription></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-muted-foreground"><p>No finalice una venta si todavía no recibió el dinero completo.</p><p>No entregue compras pendientes hasta confirmar pago y validación.</p><p>No borre ni cancele compras sin informar al coordinador de caja cuando aplique.</p></CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><HandCoins className="h-5 w-5 text-green-600" />Cómo realizar una venta</CardTitle><CardDescription>Proceso para ventas directas en Punto de Venta.</CardDescription></CardHeader><CardContent className="space-y-5"><NumberedList items={saleSteps} /><AlertBox title="Antes de pulsar Comprar">El sistema descuenta inventario y registra la venta. Verifique pago, cambio y productos en el carrito.</AlertBox></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><RefreshCcw className="h-5 w-5 text-orange-600" />Cómo realizar una devolución</CardTitle><CardDescription>Proceso para devolver unidades al inventario.</CardDescription></CardHeader><CardContent className="space-y-5"><NumberedList items={returnSteps} /><AlertBox title="Control de inventario">Una devolución aumenta el stock. Por eso debe corresponder a un producto realmente recibido en caja.</AlertBox></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-blue-600" />Cómo validar una autogestión</CardTitle><CardDescription>Proceso para compras iniciadas por el acudiente.</CardDescription></CardHeader><CardContent className="space-y-5"><NumberedList items={selfServiceSteps} /><AlertBox title="Entrega segura">Entregue solo después de ver la compra correcta y confirmar que no está cancelada ni pendiente sin pago.</AlertBox></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-primary" />Ruta rápida para una compra de autogestión pendiente</CardTitle><CardDescription>Use este flujo cuando el acudiente llega a caja con una compra hecha desde el portal.</CardDescription></CardHeader>
        <CardContent><div className="grid gap-4 md:grid-cols-4">{[["Ventas", "Ubique Compras de Autogestión Pendientes."], ["Verificar", "Abra el detalle con el código de compra."], ["Cobrar", "Si está pendiente, reciba el pago antes de entregar."], ["Entregar", "Valide y entregue los productos exactos."]].map(([title, description], index) => (<div key={title} className="rounded-lg border bg-card p-4"><div className="mb-3 flex items-center justify-between"><Badge variant="outline">Paso {index + 1}</Badge>{index < 3 && <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />}</div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>))}</div></CardContent>
      </Card>

      <Card className="border-destructive/20 bg-destructive/5"><CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><CreditCard className="h-5 w-5" />Errores que caja debe evitar</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm leading-6 text-muted-foreground md:grid-cols-2"><p>• Entregar productos de autogestión sin validar código, cédula y estado.</p><p>• Registrar una venta con cantidades diferentes a las entregadas.</p><p>• Procesar devoluciones sin recibir físicamente el producto.</p><p>• Cerrar caja sin contar efectivo y revisar el descuadre.</p></CardContent></Card>
    </div>
  );
}
