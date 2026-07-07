"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  HandCoins,
  Home,
  LogIn,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  UserCog,
  WalletCards,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Logo } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CashierTutorialProps = {
  variant?: "dashboard" | "public";
};

type PaymentMethod = "cash" | "transfer";

type Product = {
  name: string;
  price: number;
  stock: number;
  icon: string;
};

const products: Product[] = [
  { name: "Crispetas", price: 2000, stock: 48, icon: "🍿" },
  { name: "Perro caliente", price: 5000, stock: 32, icon: "🌭" },
  { name: "Empanada", price: 3000, stock: 25, icon: "🥟" },
];

const steps = [
  { label: "Turno", icon: WalletCards },
  { label: "Venta", icon: ShoppingCart },
  { label: "Autogestión", icon: ClipboardCheck },
  { label: "Devolución", icon: RotateCcw },
  { label: "Cierre", icon: CheckCircle2 },
];

const dashboardQuickLinks = [
  { href: "/dashboard/cashbox", label: "Ir a Caja", icon: WalletCards },
  { href: "/dashboard/sales", label: "Ir a Ventas", icon: ShoppingCart },
  { href: "/dashboard/redeem", label: "Validar Autogestión", icon: ClipboardCheck },
  { href: "/dashboard/returns", label: "Ir a Devoluciones", icon: RotateCcw },
];

const publicQuickLinks = [
  { href: "/self-service/tutorial", label: "Tutorial padres", icon: UserCog },
  { href: "/self-service", label: "Ver autogestión", icon: ShoppingCart },
  { href: "/", label: "Ingresar al sistema", icon: LogIn },
];

const formatCurrency = (value: number) => (
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value)
);

function TutorialTip({
  title,
  children,
  tone = "teal",
}: {
  title: string;
  children: ReactNode;
  tone?: "teal" | "warn" | "pink" | "green";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 text-sm font-semibold leading-6",
        tone === "teal" && "border-[#b2e8e8] bg-[#e6faf9] text-[#006b6f]",
        tone === "warn" && "border-[#ffcf85] bg-[#fff4e5] text-[#7a4500]",
        tone === "pink" && "border-[#ffadd4] bg-[#fff0f6] text-[#8b003a]",
        tone === "green" && "border-[#99e0c8] bg-[#e6faf4] text-[#005c42]",
      )}
    >
      <p className="mb-1 font-black">{title}</p>
      {children}
    </div>
  );
}

function BrowserMockup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#ded2c6] bg-[#f0f0f0] shadow-[0_12px_28px_rgba(26,26,26,0.08)]">
      <div className="flex items-center gap-2 bg-[#e0e0e0] px-4 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        <span className="ml-2 min-w-0 flex-1 rounded-full bg-white px-3 py-1 text-center text-[11px] font-bold text-[#555]">
          {label}
        </span>
      </div>
      <div className="bg-[#f5efe6] p-4 text-[#1a1a1a]">{children}</div>
    </div>
  );
}

function MiniQr() {
  const pattern = [1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1];

  return (
    <div className="grid grid-cols-7 gap-0.5 rounded-xl border-4 border-[#00b5bd] bg-white p-3 shadow-[0_10px_22px_rgba(0,181,189,0.22)]">
      {pattern.map((cell, index) => (
        <span key={`${cell}-${index}`} className={cn("h-2.5 w-2.5 rounded-[1px]", cell ? "bg-[#1a1a1a]" : "bg-transparent")} />
      ))}
    </div>
  );
}

function TutorialHeader({ variant }: { variant: "dashboard" | "public" }) {
  if (variant === "dashboard") {
    return <PageHeader title="Tutorial para Cajas" description="Guía dinámica para practicar ventas, devoluciones y validación de autogestión antes del turno." />;
  }

  return (
    <div className="flex w-full flex-col gap-5 rounded-3xl border border-[#e8ddd0] bg-white p-5 shadow-[0_10px_28px_rgba(26,26,26,0.06)] md:flex-row md:items-end md:justify-between">
      <div className="space-y-3">
        <Logo className="h-14 w-auto object-contain" />
        <div className="space-y-2">
          <Badge variant="secondary">Acceso público</Badge>
          <h1 className="font-headline text-3xl font-black tracking-tight text-[#1a1a1a] sm:text-4xl">Tutorial para Cajas</h1>
          <p className="max-w-3xl text-sm font-bold leading-6 text-[#777] sm:text-base">Practique el flujo real: abrir caja, vender, validar autogestiones, devolver productos y cerrar el turno.</p>
        </div>
      </div>
      <Button asChild className="h-11 rounded-xl bg-gradient-to-r from-[#00b5bd] to-[#f5c842] font-black text-white">
        <Link href="/"><LogIn className="mr-2 h-4 w-4" />Ingresar</Link>
      </Button>
    </div>
  );
}

export function CashierTutorial({ variant = "dashboard" }: CashierTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [openingCash, setOpeningCash] = useState(150000);
  const [cashReceived, setCashReceived] = useState(20000);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [redeemCode, setRedeemCode] = useState("AG-4821");
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [quantities, setQuantities] = useState<number[]>(() => products.map((_, index) => (index === 0 ? 2 : index === 1 ? 1 : 0)));

  const quickLinks = variant === "public" ? publicQuickLinks : dashboardQuickLinks;
  const cart = useMemo(() => products.map((product, index) => ({ ...product, quantity: quantities[index] })).filter((product) => product.quantity > 0), [quantities]);
  const total = cart.reduce((sum, product) => sum + product.price * product.quantity, 0);
  const change = Math.max(0, cashReceived - total);
  const closingCash = openingCash + (paymentMethod === "cash" ? total : 0) - 3000;
  const expectedStock = products[2].stock + returnQuantity;

  const goToStep = (nextStep: number) => {
    setCurrentStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setProductQuantity = (index: number, quantity: number) => {
    const nextQuantity = Math.max(0, Math.min(20, Math.floor(quantity) || 0));
    setQuantities((current) => current.map((currentQuantity, currentIndex) => (currentIndex === index ? nextQuantity : currentQuantity)));
  };

  return (
    <div className="space-y-6">
      <TutorialHeader variant={variant} />

      <Card className="border-[#b2e8e8] bg-[#e6faf9]">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge className="mb-3 bg-[#00b5bd] text-white hover:bg-[#00a3aa]">Capacitación interactiva</Badge>
              <CardTitle className="flex items-center gap-2 text-2xl text-[#1a1a1a]"><BookOpenCheck className="h-7 w-7 text-[#00b5bd]" />Aprenda haciendo, no leyendo listas largas</CardTitle>
              <CardDescription className="mt-2 max-w-3xl font-semibold text-[#006b6f]">Cada paso tiene una mini pantalla de práctica. Cambie cantidades, medios de pago y códigos para entender qué debe revisar caja antes de confirmar.</CardDescription>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {quickLinks.map((item) => (
                <Button key={`${item.href}-${item.label}`} asChild variant="outline" className="justify-start rounded-xl border-[#00b5bd]/35 bg-white font-black text-[#006b6f]">
                  <Link href={item.href}><item.icon className="mr-2 h-4 w-4" />{item.label}</Link>
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="rounded-3xl border border-[#e8ddd0] bg-white p-4 shadow-[0_10px_28px_rgba(26,26,26,0.06)]">
        <div className="grid grid-cols-5 gap-1.5">
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            const isDone = index < currentStep;
            const isActive = index === currentStep;

            return (
              <button key={step.label} type="button" className="group min-w-0" onClick={() => goToStep(index)} aria-current={isActive ? "step" : undefined}>
                <span className={cn("block h-1.5 rounded-full bg-[#e8ddd0]", isDone && "bg-[#00b5bd]", isActive && "bg-gradient-to-r from-[#00b5bd] to-[#f5c842]")} />
                <span className={cn("mt-1.5 flex flex-col items-center gap-1 text-[10px] font-black text-[#a7a09a] sm:text-xs", isDone && "text-[#008a91]", isActive && "text-[#d4006a]")}> <StepIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span className="truncate">{step.label}</span></span>
              </button>
            );
          })}
        </div>
      </div>

      {currentStep === 0 && (
        <section className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
          <Card className="rounded-3xl border-[#e8ddd0]"><CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><WalletCards className="h-7 w-7 text-[#00b5bd]" />1. Abra el turno con saldo real</CardTitle><CardDescription>La caja solo debe operar después de registrar el efectivo inicial contado.</CardDescription></CardHeader><CardContent className="space-y-4"><TutorialTip title="Regla de oro">No use valores aproximados. Cuente billetes y monedas antes de tocar Abrir Caja.</TutorialTip><BrowserMockup label="dashboard/cashbox"><label className="mb-1 block text-xs font-black text-[#777]" htmlFor="opening-cash">Saldo inicial contado</label><input id="opening-cash" type="number" value={openingCash} onChange={(event) => setOpeningCash(Number(event.target.value))} className="mb-3 h-12 w-full rounded-xl border-2 border-[#e8ddd0] bg-white px-4 text-lg font-black outline-none focus:border-[#00b5bd]" /><Button className="h-12 w-full rounded-xl bg-gradient-to-r from-[#00b5bd] to-[#f5c842] font-black text-white"><BadgeCheck className="h-4 w-4" />Abrir Caja con {formatCurrency(openingCash)}</Button></BrowserMockup></CardContent></Card>
          <Card className="rounded-3xl border-[#e8ddd0]"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#d4006a]" />Antes de vender</CardTitle></CardHeader><CardContent className="space-y-3 text-sm font-semibold leading-6 text-[#777]"><p>• Caja abierta y responsable identificado.</p><p>• Productos visibles en el punto de venta.</p><p>• Efectivo inicial guardado y contado.</p><p>• Si hay descuadre inicial, avise antes de iniciar.</p></CardContent></Card>
        </section>
      )}

      {currentStep === 1 && (
        <section className="space-y-5"><Card className="rounded-3xl border-[#e8ddd0]"><CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><HandCoins className="h-7 w-7 text-[#00a878]" />2. Registre la venta y cobre</CardTitle><CardDescription>Practique cantidades, total recibido y devolución antes de pulsar Comprar.</CardDescription></CardHeader><CardContent className="space-y-4"><BrowserMockup label="dashboard/sales"><div className="mb-3 grid gap-2 sm:grid-cols-3">{products.map((product, index) => { const quantity = quantities[index]; return (<div key={product.name} className={cn("rounded-2xl border-2 bg-[#fff8ee] p-3", quantity > 0 ? "border-[#00b5bd]" : "border-[#e8ddd0]")}><div className="text-3xl">{product.icon}</div><p className="mt-2 text-xs font-black uppercase">{product.name}</p><p className="text-sm font-black text-[#d4006a]">{formatCurrency(product.price)}</p><div className="mt-2 grid h-9 grid-cols-[32px_1fr_32px] items-center gap-1"><button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00a878] text-white" onClick={() => setProductQuantity(index, quantity - 1)} aria-label={`Quitar ${product.name}`}><Minus className="h-4 w-4" /></button><input aria-label={`Cantidad de ${product.name}`} inputMode="numeric" type="number" value={quantity} onChange={(event) => setProductQuantity(index, Number(event.target.value))} className="h-8 min-w-0 rounded-lg border text-center text-sm font-black" /><button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00a878] text-white" onClick={() => setProductQuantity(index, quantity + 1)} aria-label={`Agregar ${product.name}`}><Plus className="h-4 w-4" /></button></div></div>); })}</div><div className="rounded-2xl border-2 border-dashed border-[#e8ddd0] bg-white p-4"><p className="mb-2 font-black">Carrito</p>{cart.map((product) => (<div key={product.name} className="flex justify-between border-b border-[#e8ddd0] py-1 text-sm font-bold last:border-0"><span>{product.name} x {product.quantity}</span><span className="text-[#d4006a]">{formatCurrency(product.price * product.quantity)}</span></div>))}<div className="mt-3 flex justify-between text-lg font-black"><span>Total</span><span className="text-[#d4006a]">{formatCurrency(total)}</span></div></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => setPaymentMethod("cash")} className={cn("rounded-xl border-2 p-3 text-sm font-black", paymentMethod === "cash" ? "border-[#00b5bd] bg-[#e6faf9] text-[#006b6f]" : "border-[#e8ddd0] bg-white")}>Efectivo</button><button type="button" onClick={() => setPaymentMethod("transfer")} className={cn("rounded-xl border-2 p-3 text-sm font-black", paymentMethod === "transfer" ? "border-[#d4006a] bg-[#fff0f6] text-[#8b003a]" : "border-[#e8ddd0] bg-white")}>Transferencia</button><input type="number" value={cashReceived} onChange={(event) => setCashReceived(Number(event.target.value))} className="h-12 rounded-xl border-2 border-[#e8ddd0] bg-white px-3 text-sm font-black" aria-label="Efectivo recibido" /></div><div className="mt-3 rounded-2xl bg-[#e6faf4] p-4 text-sm font-black text-[#005c42]">Cambio sugerido: {formatCurrency(paymentMethod === "cash" ? change : 0)}</div></BrowserMockup><TutorialTip title="Antes de Comprar" tone="warn">Reciba el pago completo, entregue el cambio correcto y confirme productos en voz alta.</TutorialTip></CardContent></Card></section>
      )}

      {currentStep === 2 && (
        <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]"><Card className="rounded-3xl border-[#e8ddd0]"><CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><PackageCheck className="h-7 w-7 text-[#00b5bd]" />3. Valide compras de autogestión</CardTitle><CardDescription>Use código, cédula, pago y productos para entregar sin errores.</CardDescription></CardHeader><CardContent className="space-y-4"><BrowserMockup label="dashboard/redeem"><label className="mb-1 block text-xs font-black text-[#777]" htmlFor="redeem-code">Código de compra</label><input id="redeem-code" value={redeemCode} onChange={(event) => setRedeemCode(event.target.value.toUpperCase())} className="mb-3 h-12 w-full rounded-xl border-2 border-[#e8ddd0] bg-white px-4 text-lg font-black outline-none focus:border-[#00b5bd]" /><div className="rounded-2xl border border-[#99e0c8] bg-[#e6faf4] p-4"><p className="text-xs font-black uppercase text-[#008a91]">Compra encontrada</p><p className="mt-1 text-lg font-black">{redeemCode || "AG-4821"} · CC 24512345</p><p className="text-sm font-bold text-[#005c42]">2 Crispetas + 1 Perro caliente · {formatCurrency(9000)}</p><Badge className="mt-3 bg-[#00a878] text-white">Pago confirmado</Badge></div><div className="mt-3 flex flex-wrap gap-2"><Button className="rounded-xl bg-gradient-to-r from-[#00b5bd] to-[#f5c842] font-black text-white"><PackageCheck className="h-4 w-4" />Validar y entregar</Button><Button variant="outline" className="rounded-xl"><Search className="h-4 w-4" />Buscar otra</Button></div></BrowserMockup></CardContent></Card><Card className="rounded-3xl border-[#ffcf85] bg-[#fff4e5]"><CardHeader><CardTitle className="text-[#7a4500]">Checklist de entrega</CardTitle></CardHeader><CardContent className="space-y-3 text-sm font-semibold leading-6 text-[#7a4500]"><p>• Código coincide con el acudiente.</p><p>• Cédula y productos son correctos.</p><p>• Estado no está cancelado.</p><p>• Si el pago está pendiente, cobre primero.</p></CardContent></Card></section>
      )}

      {currentStep === 3 && (
        <section className="space-y-5"><Card className="rounded-3xl border-[#e8ddd0]"><CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><RefreshCcw className="h-7 w-7 text-orange-600" />4. Registre devoluciones con inventario claro</CardTitle><CardDescription>Solo devuelva unidades recibidas físicamente y en buen estado.</CardDescription></CardHeader><CardContent className="space-y-4"><BrowserMockup label="dashboard/returns"><div className="rounded-2xl border bg-white p-4"><p className="text-xs font-black uppercase text-[#777]">Producto devuelto</p><p className="mt-1 text-xl font-black">Empanada</p><p className="text-sm font-bold text-[#777]">Stock actual: {products[2].stock}</p><label className="mt-3 block text-xs font-black text-[#777]" htmlFor="return-quantity">Cantidad devuelta</label><input id="return-quantity" type="number" min={1} max={10} value={returnQuantity} onChange={(event) => setReturnQuantity(Math.max(1, Number(event.target.value) || 1))} className="mt-1 h-12 w-full rounded-xl border-2 border-[#e8ddd0] px-4 text-lg font-black" /><div className="mt-3 rounded-xl bg-[#e6faf4] p-3 text-sm font-black text-[#005c42]">Nuevo stock esperado: {expectedStock}</div></div></BrowserMockup><TutorialTip title="Control de inventario" tone="warn">Una devolución aumenta el stock. Si el producto no volvió a caja, no registre devolución.</TutorialTip></CardContent></Card></section>
      )}

      {currentStep === 4 && (
        <section className="space-y-5"><Card className="rounded-3xl border-[#e8ddd0]"><CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><ReceiptText className="h-7 w-7 text-[#d4006a]" />5. Cierre caja y revise descuadre</CardTitle><CardDescription>Compare efectivo esperado contra el dinero contado antes de terminar el turno.</CardDescription></CardHeader><CardContent className="space-y-4"><BrowserMockup label="dashboard/cashbox/cierre"><div className="grid gap-3 sm:grid-cols-3">{[["Inicial", openingCash], ["Ventas efectivo", paymentMethod === "cash" ? total : 0], ["Devoluciones", -3000]].map(([label, value]) => (<div key={String(label)} className="rounded-2xl border bg-white p-4 text-center"><p className="text-xs font-black uppercase text-[#777]">{label}</p><p className="mt-1 text-lg font-black text-[#d4006a]">{formatCurrency(Number(value))}</p></div>))}</div><div className="mt-3 rounded-2xl border-2 border-[#00b5bd] bg-[#e6faf9] p-5 text-center"><p className="text-xs font-black uppercase text-[#006b6f]">Efectivo esperado al cierre</p><p className="text-3xl font-black text-[#006b6f]">{formatCurrency(closingCash)}</p></div></BrowserMockup><TutorialTip title="Cierre responsable" tone="green">Cuente el dinero real, revise diferencias y deje observación si existe descuadre.</TutorialTip></CardContent></Card></section>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" className="h-11 rounded-xl" disabled={currentStep === 0} onClick={() => goToStep(currentStep - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button>
        <span className="text-xs font-black text-[#777]">PASO {currentStep + 1} DE {steps.length}</span>
        {currentStep < steps.length - 1 ? <Button className="h-11 rounded-xl bg-gradient-to-r from-[#00b5bd] to-[#f5c842] font-black text-white" onClick={() => goToStep(currentStep + 1)}>Siguiente<ChevronRight className="h-4 w-4" /></Button> : <Button className="h-11 rounded-xl bg-gradient-to-r from-[#00b5bd] to-[#f5c842] font-black text-white" onClick={() => goToStep(0)}><Home className="h-4 w-4" />Reiniciar</Button>}
      </div>

      <Card className="border-destructive/20 bg-destructive/5"><CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><CreditCard className="h-5 w-5" />Errores que caja debe evitar</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm leading-6 text-muted-foreground md:grid-cols-2"><p>• Entregar productos de autogestión sin validar código, cédula y estado.</p><p>• Registrar una venta con cantidades diferentes a las entregadas.</p><p>• Procesar devoluciones sin recibir físicamente el producto.</p><p>• Cerrar caja sin contar efectivo y revisar el descuadre.</p></CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-primary" />Ruta rápida para una compra de autogestión pendiente</CardTitle><CardDescription>Resumen visual para cuando el acudiente llega a caja con una compra hecha desde el portal.</CardDescription></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-4">{[["Ventas", "Ubique Compras de Autogestión Pendientes."], ["Verificar", "Abra el detalle con el código de compra."], ["Cobrar", "Si está pendiente, reciba el pago antes de entregar."], ["Entregar", "Valide y entregue los productos exactos."]].map(([title, description], index) => (<div key={title} className="rounded-lg border bg-card p-4"><div className="mb-3 flex items-center justify-between"><Badge variant="outline">Paso {index + 1}</Badge>{index < 3 && <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />}</div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>))}</div></CardContent></Card>
    </div>
  );
}
