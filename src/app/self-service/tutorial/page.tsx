"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Minus,
  Plus,
  QrCode,
  RotateCcw,
  ShoppingCart,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const steps = [
  { label: "Productos", icon: ShoppingCart },
  { label: "Celular", icon: Smartphone },
  { label: "Pago", icon: CreditCard },
  { label: "Código", icon: QrCode },
] as const;

const products = [
  { name: "Crispetas", price: 2000, icon: "🍿" },
  { name: "Perro", price: 5000, icon: "🌭" },
  { name: "Empanada", price: 3000, icon: "🥟" },
] as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function SelfServiceTutorialPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [quantities, setQuantities] = useState<number[]>(() => products.map(() => 0));
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"caja" | "daviplata" | null>(null);

  const cart = useMemo(
    () => products
      .map((product, index) => ({ ...product, quantity: quantities[index] }))
      .filter((product) => product.quantity > 0),
    [quantities],
  );
  const total = cart.reduce((sum, product) => sum + product.price * product.quantity, 0);
  const normalizedPhone = phone.replace(/\D/g, "");
  const validPhone = normalizedPhone.length >= 7 && normalizedPhone.length <= 15;

  const goToStep = (step: number) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const changeQuantity = (index: number, nextQuantity: number) => {
    setQuantities((current) => current.map((quantity, currentIndex) => (
      currentIndex === index ? Math.max(0, Math.min(20, nextQuantity)) : quantity
    )));
  };

  const resetTutorial = () => {
    setQuantities(products.map(() => 0));
    setPhone("");
    setPaymentMethod(null);
    goToStep(0);
  };

  return (
    <main className="min-h-[100dvh] bg-background pb-12 text-foreground">
      <header className="sticky top-0 z-40 border-b-2 border-[#d7e1ec] bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Image
            src="/molly-ventas.png"
            alt="Logo de Molly Ventas"
            width={56}
            height={56}
            className="h-14 w-14 rounded-full border-2 border-[#f2c84b] bg-[#fff3c4] object-contain p-1"
            priority
          />
          <div className="min-w-0">
            <h1 className="text-lg font-black sm:text-xl">Tutorial de Autogestión</h1>
            <p className="text-xs font-bold text-[#777] sm:text-sm">Compre sin cédula, usando solo su celular</p>
          </div>
          <Button asChild variant="outline" className="ml-auto border-[#0d4d8b]/35 bg-[#edf4fb] font-black text-[#073b72]">
            <Link href="/self-service">
              <ShoppingCart className="h-4 w-4" />
              Tienda
            </Link>
          </Button>
        </div>
        <div className="border-t border-[#d7e1ec] px-4 py-3">
          <div className="mx-auto grid max-w-3xl grid-cols-4 gap-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => goToStep(index)}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-center text-[11px] font-black transition sm:text-xs",
                    currentStep === index
                      ? "border-[#0d4d8b] bg-[#fff3c4] text-[#073b72]"
                      : "border-[#d7e1ec] bg-white text-[#5f6f82]",
                  )}
                >
                  <Icon className="mx-auto mb-1 h-4 w-4" />
                  {step.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <section className="rounded-3xl border border-[#d7e1ec] bg-white p-5 shadow-[0_10px_28px_rgba(7,59,114,0.08)] sm:p-7">
          {currentStep === 0 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#0d4d8b]">Paso 1</p>
                <h2 className="mt-2 text-2xl font-black">Elija sus productos</h2>
                <p className="mt-2 font-semibold text-[#666]">Puede comenzar a comprar inmediatamente. No necesita registrarse ni ingresar cédula.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {products.map((product, index) => {
                  const quantity = quantities[index];
                  return (
                    <article key={product.name} className="rounded-2xl border-2 border-[#d7e1ec] bg-[#f8fbfe] p-3 text-center">
                      <span className="text-3xl">{product.icon}</span>
                      <p className="mt-2 text-sm font-black uppercase">{product.name}</p>
                      <p className="text-sm font-black text-[#0d4d8b]">{formatCurrency(product.price)}</p>
                      {quantity === 0 ? (
                        <button type="button" onClick={() => changeQuantity(index, 1)} className="mt-3 h-9 w-full rounded-xl bg-[#0d4d8b] text-xs font-black text-white hover:bg-[#073b72]">
                          Agregar
                        </button>
                      ) : (
                        <div className="mt-3 grid grid-cols-[32px_1fr_32px] items-center gap-1">
                          <button type="button" onClick={() => changeQuantity(index, quantity - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0d4d8b] text-white"><Minus className="h-4 w-4" /></button>
                          <span className="font-black">{quantity}</span>
                          <button type="button" onClick={() => changeQuantity(index, quantity + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0d4d8b] text-white"><Plus className="h-4 w-4" /></button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="rounded-2xl border border-[#f2c84b] bg-[#fff3c4] p-4">
                <div className="flex items-center justify-between font-black"><span>Total</span><span className="text-xl text-[#073b72]">{formatCurrency(total)}</span></div>
              </div>
              <div className="flex justify-end">
                <Button disabled={cart.length === 0} onClick={() => goToStep(1)} className="bg-[#0d4d8b] font-black text-white hover:bg-[#073b72]">Continuar <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#0d4d8b]">Paso 2</p>
                <h2 className="mt-2 text-2xl font-black">Ingrese solo su celular</h2>
                <p className="mt-2 font-semibold text-[#666]">El celular se solicita al finalizar el pedido. La tienda no pide cédula.</p>
              </div>
              <label className="block text-sm font-black" htmlFor="tutorial-phone">Número de celular</label>
              <input
                id="tutorial-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="3001234567"
                className="h-14 w-full rounded-2xl border-2 border-[#d7e1ec] bg-white px-4 text-lg font-black outline-none focus:border-[#0d4d8b] focus:ring-4 focus:ring-[#0d4d8b]/15"
              />
              <p className="rounded-2xl border border-[#cbd9e8] bg-[#edf4fb] p-4 text-sm font-semibold text-[#073b72]">Este número permite identificar el pedido y contactar al comprador si es necesario.</p>
              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={() => goToStep(0)}><ChevronLeft className="h-4 w-4" />Anterior</Button>
                <Button disabled={!validPhone} onClick={() => goToStep(2)} className="bg-[#0d4d8b] font-black text-white hover:bg-[#073b72]">Continuar <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#0d4d8b]">Paso 3</p>
                <h2 className="mt-2 text-2xl font-black">Escoja cómo pagar</h2>
                <p className="mt-2 font-semibold text-[#666]">Puede pagar en caja o por DaviPlata/Bre-B usando el código del pedido como referencia.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ["caja", "Pagar en caja", "Presente el código o QR al cajero."],
                  ["daviplata", "DaviPlata / Bre-B", "Transfiera a la llave del colegio."],
                ] as const).map(([value, title, description]) => (
                  <button key={value} type="button" onClick={() => setPaymentMethod(value)} className={cn("rounded-2xl border-2 p-5 text-left", paymentMethod === value ? "border-[#0d4d8b] bg-[#fff3c4]" : "border-[#d7e1ec]")}>
                    <CreditCard className="mb-3 h-8 w-8 text-[#0d4d8b]" />
                    <p className="font-black uppercase">{title}</p>
                    <p className="mt-1 text-sm font-semibold text-[#666]">{description}</p>
                  </button>
                ))}
              </div>
              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={() => goToStep(1)}><ChevronLeft className="h-4 w-4" />Anterior</Button>
                <Button disabled={!paymentMethod} onClick={() => goToStep(3)} className="bg-[#0d4d8b] font-black text-white hover:bg-[#073b72]">Ver código <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-5 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-[#0d4d8b]" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#0d4d8b]">Paso 4</p>
                <h2 className="mt-2 text-2xl font-black">Guarde su código de compra</h2>
                <p className="mt-2 font-semibold text-[#666]">Al confirmar, la tienda mostrará el código y el QR para pagar y retirar los productos.</p>
              </div>
              <div className="mx-auto max-w-sm rounded-3xl border-2 border-[#f2c84b] bg-[#fff3c4] p-6">
                <QrCode className="mx-auto h-24 w-24 text-[#1a1a1a]" />
                <p className="mt-3 font-mono text-2xl font-black text-[#073b72]">PVX0001</p>
                <p className="mt-1 text-sm font-semibold text-[#666]">Ejemplo de código; cada compra genera uno diferente.</p>
              </div>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Button variant="outline" onClick={resetTutorial}><RotateCcw className="h-4 w-4" />Repetir tutorial</Button>
                <Button asChild className="bg-[#0d4d8b] font-black text-white hover:bg-[#073b72]"><Link href="/self-service"><ShoppingCart className="h-4 w-4" />Ir a comprar</Link></Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
