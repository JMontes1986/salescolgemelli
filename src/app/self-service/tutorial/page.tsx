"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  History,
  Home,
  IdCard,
  Minus,
  PackageCheck,
  Plus,
  RefreshCcw,
  ShoppingCart,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const steps = [
  { label: "Inicio", icon: Home },
  { label: "Cédula", icon: IdCard },
  { label: "Productos", icon: ShoppingCart },
  { label: "Pago", icon: CreditCard },
  { label: "Historial", icon: History },
];

const products = [
  { name: "Crispetas", price: 2000, icon: "🍿" },
  { name: "Perro", price: 5000, icon: "🌭" },
  { name: "Empanada", price: 3000, icon: "🥟" },
];

const formatCurrency = (value: number) => (
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value)
);

const TutorialTip = ({
  title,
  children,
  tone = "teal",
}: {
  title: string;
  children: ReactNode;
  tone?: "teal" | "warn" | "pink" | "green";
}) => (
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

const BrowserMockup = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="overflow-hidden rounded-2xl border border-[#ded2c6] bg-[#f0f0f0] shadow-[0_12px_28px_rgba(26,26,26,0.08)]">
    <div className="flex items-center gap-2 bg-[#e0e0e0] px-4 py-2">
      <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
      <span className="ml-2 min-w-0 flex-1 rounded-full bg-white px-3 py-1 text-center text-[11px] font-bold text-[#555]">
        {label}
      </span>
    </div>
    <div className="bg-[#f5efe6] p-4">{children}</div>
  </div>
);

const MiniQr = () => {
  const pattern = [
    1, 1, 1, 0, 1, 1, 1,
    1, 0, 0, 1, 0, 0, 1,
    1, 0, 1, 0, 1, 0, 1,
    1, 0, 0, 1, 0, 0, 1,
    1, 1, 1, 0, 1, 1, 1,
    0, 1, 0, 1, 0, 1, 0,
    1, 0, 1, 1, 0, 1, 1,
  ];

  return (
    <div className="mx-auto grid grid-cols-7 gap-0.5 rounded-xl border-4 border-[#00b5bd] bg-white p-4 shadow-[0_10px_22px_rgba(0,181,189,0.25)]">
      {pattern.map((cell, index) => (
        <span
          key={`${cell}-${index}`}
          className={cn("h-3 w-3 rounded-[1px]", cell ? "bg-[#1a1a1a]" : "bg-transparent")}
        />
      ))}
    </div>
  );
};

export default function SelfServiceTutorialPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [cedula, setCedula] = useState("");
  const [isCedulaActive, setIsCedulaActive] = useState(false);
  const [quantities, setQuantities] = useState<number[]>(() => products.map(() => 0));
  const [paymentMethod, setPaymentMethod] = useState<"caja" | "davi" | null>(null);

  const cart = useMemo(
    () => products
      .map((product, index) => ({ ...product, quantity: quantities[index] }))
      .filter((product) => product.quantity > 0),
    [quantities],
  );
  const total = cart.reduce((sum, product) => sum + product.price * product.quantity, 0);

  const goToStep = (nextStep: number) => {
    setCurrentStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetTutorial = () => {
    setCedula("");
    setIsCedulaActive(false);
    setQuantities(products.map(() => 0));
    setPaymentMethod(null);
    goToStep(0);
  };

  const handleCedulaChange = (value: string) => {
    const nextValue = value.replace(/\D/g, "");
    setCedula(nextValue);
    setIsCedulaActive(false);
  };

  const setProductQuantity = (index: number, quantity: number) => {
    const nextQuantity = Math.max(0, Math.min(20, Math.floor(quantity) || 0));

    setQuantities((current) => current.map((currentQuantity, currentIndex) => (
      currentIndex === index ? nextQuantity : currentQuantity
    )));
  };

  const addProduct = (index: number) => {
    setProductQuantity(index, Math.max(quantities[index], 1));
  };

  return (
    <main className="min-h-screen bg-[#f5efe6] pb-12 text-[#1a1a1a]">
      <header className="sticky top-0 z-40 border-b-2 border-[#e8ddd0] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#e8ddd0] bg-[#fff8ee] p-1">
            <Image
              src="/molly-ventas.png"
              alt="Logo de Molly Ventas"
              width={96}
              height={96}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-black leading-tight sm:text-xl">Tutorial Autogestión</h1>
            <p className="text-xs font-bold text-[#777] sm:text-sm">Guía para papás antes de comprar</p>
          </div>
          <Link
            href="/self-service"
            className="ml-auto inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#00b5bd]/35 bg-[#e6faf9] px-3 text-xs font-black text-[#006b6f] hover:bg-[#d7f4f3]"
          >
            <ShoppingCart className="h-4 w-4" />
            Tienda
          </Link>
        </div>

        <div className="border-t border-[#e8ddd0] bg-white px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <div className="grid grid-cols-5 gap-1.5">
              {steps.map((step, index) => {
                const StepIcon = step.icon;
                const isDone = index < currentStep;
                const isActive = index === currentStep;

                return (
                  <button
                    key={step.label}
                    type="button"
                    className="group min-w-0"
                    onClick={() => goToStep(index)}
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span
                      className={cn(
                        "block h-1.5 rounded-full bg-[#e8ddd0]",
                        isDone && "bg-[#00b5bd]",
                        isActive && "bg-gradient-to-r from-[#00b5bd] to-[#f5c842]",
                      )}
                    />
                    <span
                      className={cn(
                        "mt-1.5 flex flex-col items-center gap-1 text-[10px] font-black text-[#a7a09a] sm:text-xs",
                        isDone && "text-[#008a91]",
                        isActive && "text-[#d4006a]",
                      )}
                    >
                      <StepIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="truncate">{step.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-5">
        {currentStep === 0 && (
          <section className="space-y-4">
            <div className="rounded-3xl border border-[#e8ddd0] bg-white p-5 shadow-[0_10px_28px_rgba(26,26,26,0.06)] sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#00b5bd] to-[#f5c842] text-lg font-black text-white">
                  0
                </div>
                <div>
                  <h2 className="text-2xl font-black leading-tight">Bienvenido, papá o mamá</h2>
                  <p className="mt-1 text-sm font-bold text-[#777]">Esta guía le muestra cómo comprar desde su celular.</p>
                </div>
              </div>

              <div className="mb-5 overflow-hidden rounded-3xl border border-[#e8ddd0] bg-[#fff8ee]">
                <Image
                  src="/molly-ventas.png"
                  alt="Logo de Molly Ventas"
                  width={1536}
                  height={864}
                  className="h-auto w-full object-cover"
                  priority
                />
              </div>

              <div className="space-y-3">
                <TutorialTip title="¿Qué es la Autogestión?">
                  Es la tienda virtual del Colegio Gemelli. Puede comprar desde el celular, evitar filas y pagar en caja o por DaviPlata/Bre-B.
                </TutorialTip>
                <TutorialTip title="¿Dónde entro?" tone="warn">
                  Abra en su celular la página de autogestión del colegio. Desde esta guía también puede tocar el botón Tienda para ir directo.
                </TutorialTip>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ["01", "Cédula", "Ingrese su documento para identificarse."],
                  ["02", "Pedido", "Escoja los productos que quiere comprar."],
                  ["03", "Pago", "Pague en caja o por DaviPlata/Bre-B."],
                ].map(([number, title, description]) => (
                  <div key={number} className="rounded-2xl border border-[#e8ddd0] bg-[#fff8ee] p-4 text-center">
                    <p className="text-2xl font-black text-[#d4006a]">{number}</p>
                    <p className="mt-1 font-black">{title}</p>
                    <p className="mt-1 text-xs font-bold leading-5 text-[#777]">{description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span />
              <span className="text-xs font-black text-[#777]">PASO 1 DE 5</span>
              <Button className="h-11 rounded-xl bg-gradient-to-r from-[#00b5bd] to-[#f5c842] font-black text-white" onClick={() => goToStep(1)}>
                Empezar
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </section>
        )}

        {currentStep === 1 && (
          <section className="space-y-4">
            <div className="rounded-3xl border border-[#e8ddd0] bg-white p-5 shadow-[0_10px_28px_rgba(26,26,26,0.06)] sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#00b5bd] to-[#f5c842] text-lg font-black text-white">
                  1
                </div>
                <div>
                  <h2 className="text-2xl font-black leading-tight">Ingrese su número de cédula</h2>
                  <p className="mt-1 text-sm font-bold text-[#777]">Este es el primer paso obligatorio antes de comprar.</p>
                </div>
              </div>

              <div className="space-y-4">
                <TutorialTip title="¿Por qué pide la cédula?">
                  El colegio necesita asociar la compra al acudiente. Use siempre la cédula registrada como padre de familia.
                </TutorialTip>

                <BrowserMockup label="salescolgemelli.netlify.app/self-service">
                  <p className="text-base font-black">COMPRA RÁPIDA 80&apos;s / 90&apos;s</p>
                  <p className="mb-3 text-xs font-bold text-[#777]">Ingrese su cédula para activar su perfil de compra.</p>
                  <label className="mb-1 block text-xs font-black text-[#777]" htmlFor="tutorial-cedula">
                    Número de cédula
                  </label>
                  <input
                    id="tutorial-cedula"
                    inputMode="numeric"
                    value={cedula}
                    onChange={(event) => handleCedulaChange(event.target.value)}
                    placeholder="Ej: 24512345"
                    className="mb-3 h-12 w-full rounded-xl border-2 border-[#e8ddd0] bg-white px-4 text-lg font-black text-[#1a1a1a] outline-none focus:border-[#00b5bd] focus:ring-4 focus:ring-[#00b5bd]/15"
                  />
                  <Button
                    className="h-12 w-full rounded-xl bg-gradient-to-r from-[#00b5bd] to-[#f5c842] font-black text-white disabled:opacity-40"
                    disabled={cedula.length < 6}
                    onClick={() => setIsCedulaActive(true)}
                  >
                    <IdCard className="h-4 w-4" />
                    Activar cédula
                  </Button>
                  {isCedulaActive && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#99e0c8] bg-[#e6faf4] p-3 text-sm font-black text-[#00a878]">
                      <BadgeCheck className="h-5 w-5" />
                      Perfil activado. Ya puede agregar productos.
                    </div>
                  )}
                </BrowserMockup>

                <TutorialTip title="Importante" tone="warn">
                  Sin activar la cédula, el botón para generar el código de pago permanece bloqueado.
                </TutorialTip>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => goToStep(0)}>
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="text-xs font-black text-[#777]">PASO 2 DE 5</span>
              <Button className="h-11 rounded-xl bg-gradient-to-r from-[#00b5bd] to-[#f5c842] font-black text-white" disabled={!isCedulaActive} onClick={() => goToStep(2)}>
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </section>
        )}

        {currentStep === 2 && (
          <section className="space-y-4">
            <div className="rounded-3xl border border-[#e8ddd0] bg-white p-5 shadow-[0_10px_28px_rgba(26,26,26,0.06)] sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#00b5bd] to-[#f5c842] text-lg font-black text-white">
                  2
                </div>
                <div>
                  <h2 className="text-2xl font-black leading-tight">Elija los productos</h2>
                  <p className="mt-1 text-sm font-bold text-[#777]">Toque un producto para agregarlo al pedido.</p>
                </div>
              </div>

              <div className="space-y-4">
                <TutorialTip title="¿Cómo agrego productos?">
                  Toque Agregar en cada producto que quiera. El carrito se actualiza en la parte de abajo.
                </TutorialTip>

                <BrowserMockup label="Productos disponibles">
                  <p className="text-base font-black">PRODUCTOS DISPONIBLES</p>
                  <p className="mb-3 text-xs font-bold text-[#777]">Toque un producto para agregarlo al pedido.</p>

                  <div className="mb-3 grid grid-cols-3 gap-2">
                    {products.map((product, index) => {
                      const quantity = quantities[index];
                      const isSelected = quantity > 0;

                      return (
                        <div
                          key={product.name}
                          className={cn(
                            "relative overflow-hidden rounded-2xl border-2 bg-[#fff8ee] text-left transition hover:border-[#00b5bd]",
                            isSelected ? "border-[#00b5bd] shadow-[0_8px_20px_rgba(0,181,189,0.22)]" : "border-[#e8ddd0]",
                          )}
                        >
                          {isSelected && (
                            <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#00b5bd] text-xs font-black text-white">
                              ✓
                            </span>
                          )}
                          <span className="flex aspect-square items-center justify-center text-3xl">{product.icon}</span>
                          <span className="block p-2">
                            <span className="block text-xs font-black uppercase leading-tight">{product.name}</span>
                            <span className="mt-1 block text-sm font-black text-[#d4006a]">{formatCurrency(product.price)}</span>
                            {isSelected ? (
                              <span className="mt-2 grid h-9 grid-cols-[28px_1fr_28px] items-center gap-1">
                                <button
                                  type="button"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00a878] text-white"
                                  onClick={() => setProductQuantity(index, quantity - 1)}
                                  aria-label={`Quitar una unidad de ${product.name}`}
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <input
                                  aria-label={`Cantidad de ${product.name}`}
                                  inputMode="numeric"
                                  min={0}
                                  max={20}
                                  type="number"
                                  value={quantity}
                                  onChange={(event) => setProductQuantity(index, Number(event.target.value))}
                                  className="h-8 min-w-0 rounded-lg border border-[#00b5bd]/45 bg-white text-center text-sm font-black text-[#1a1a1a]"
                                />
                                <button
                                  type="button"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00a878] text-white"
                                  onClick={() => setProductQuantity(index, quantity + 1)}
                                  aria-label={`Agregar una unidad de ${product.name}`}
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="mt-2 flex h-8 w-full items-center justify-center rounded-lg bg-gradient-to-r from-[#00b5bd] to-[#f5c842] text-[11px] font-black text-white"
                                onClick={() => addProduct(index)}
                              >
                                Agregar
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl border-2 border-dashed border-[#e8ddd0] bg-white p-4">
                    <p className="mb-2 text-sm font-black">TU PEDIDO</p>
                    {cart.length > 0 ? (
                      <div className="space-y-2">
                        {cart.map((product) => (
                          <div key={product.name} className="flex justify-between gap-3 border-b border-[#e8ddd0] py-1 text-sm font-bold last:border-0">
                            <span>{product.name} x {product.quantity}</span>
                            <span className="shrink-0 font-black text-[#d4006a]">{formatCurrency(product.price * product.quantity)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between border-t-2 border-[#e8ddd0] pt-3">
                          <span className="font-black">TOTAL</span>
                          <span className="text-xl font-black text-[#d4006a]">{formatCurrency(total)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="py-2 text-center text-xs font-bold text-[#777]">Agregue productos para generar su código de pago.</p>
                    )}
                  </div>
                </BrowserMockup>

                <TutorialTip title="Revise antes de continuar" tone="warn">
                  Confirme productos, cantidades y total antes de generar el código de pago.
                </TutorialTip>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => goToStep(1)}>
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="text-xs font-black text-[#777]">PASO 3 DE 5</span>
              <Button className="h-11 rounded-xl bg-gradient-to-r from-[#00b5bd] to-[#f5c842] font-black text-white" disabled={cart.length === 0} onClick={() => goToStep(3)}>
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </section>
        )}

        {currentStep === 3 && (
          <section className="space-y-4">
            <div className="rounded-3xl border border-[#e8ddd0] bg-white p-5 shadow-[0_10px_28px_rgba(26,26,26,0.06)] sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#00b5bd] to-[#f5c842] text-lg font-black text-white">
                  3
                </div>
                <div>
                  <h2 className="text-2xl font-black leading-tight">Escoja cómo pagar</h2>
                  <p className="mt-1 text-sm font-bold text-[#777]">Tiene dos opciones: caja o DaviPlata/Bre-B.</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className={cn(
                    "rounded-2xl border-2 bg-white p-5 text-center transition hover:border-[#00b5bd]",
                    paymentMethod === "caja" ? "border-[#00b5bd] shadow-[0_10px_24px_rgba(0,181,189,0.18)]" : "border-[#e8ddd0]",
                  )}
                  onClick={() => setPaymentMethod("caja")}
                >
                  <CreditCard className="mx-auto mb-3 h-10 w-10 text-[#00b5bd]" />
                  <p className="font-black">PAGAR EN CAJA</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-[#777]">Presente el código o QR al cajero del colegio.</p>
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-2xl border-2 bg-white p-5 text-center transition hover:border-[#d4006a]",
                    paymentMethod === "davi" ? "border-[#d4006a] shadow-[0_10px_24px_rgba(212,0,106,0.14)]" : "border-[#e8ddd0]",
                  )}
                  onClick={() => setPaymentMethod("davi")}
                >
                  <Smartphone className="mx-auto mb-3 h-10 w-10 text-[#d4006a]" />
                  <p className="font-black">DAVIPLATA / BRE-B</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-[#777]">Transfiera a la llave del colegio usando su cédula como referencia.</p>
                </button>
              </div>

              {paymentMethod === "caja" && (
                <div className="mt-4 space-y-4">
                  <TutorialTip title="¿Cómo uso el código en caja?">
                    Después de generar el código de pago, muestre el QR al cajero. El cajero lo escanea y registra el pago.
                  </TutorialTip>
                  <div className="text-center">
                    <MiniQr />
                    <p className="mt-2 text-xs font-bold text-[#777]">Código de pago de ejemplo</p>
                  </div>
                </div>
              )}

              {paymentMethod === "davi" && (
                <div className="mt-4 space-y-4">
                  <TutorialTip title="¿Cómo pago por DaviPlata o Bre-B?" tone="pink">
                    Abra su app de Davivienda o Bre-B, toque transferir a llave Bre-B e ingrese el número indicado por el colegio.
                  </TutorialTip>
                  <div className="rounded-2xl border-2 border-[#ffadd4] bg-[#fff0f6] p-4">
                    {[
                      ["Llave Bre-B / DaviPlata", "3206766574"],
                      ["Titular de la cuenta", "Col. Franciscano Agustín Gemelli"],
                      ["En el concepto escriba", "Su número de cédula"],
                    ].map(([label, value]) => (
                      <div key={label} className="border-b border-[#d4006a]/10 py-3 first:pt-0 last:border-0 last:pb-0">
                        <p className="text-[11px] font-black uppercase text-[#aa4477]">{label}</p>
                        <p className={cn("font-black", value === "3206766574" ? "text-2xl text-[#d4006a]" : "text-base")}>{value}</p>
                      </div>
                    ))}
                  </div>
                  <TutorialTip title="Guarde el comprobante" tone="warn">
                    Tome captura o foto del comprobante por si el colegio necesita validar la transferencia.
                  </TutorialTip>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => goToStep(2)}>
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="text-xs font-black text-[#777]">PASO 4 DE 5</span>
              <Button className="h-11 rounded-xl bg-gradient-to-r from-[#00b5bd] to-[#f5c842] font-black text-white" disabled={!paymentMethod} onClick={() => goToStep(4)}>
                Historial
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </section>
        )}

        {currentStep === 4 && (
          <section className="space-y-4">
            <div className="rounded-3xl border border-[#e8ddd0] bg-white p-5 shadow-[0_10px_28px_rgba(26,26,26,0.06)] sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#00b5bd] to-[#f5c842] text-lg font-black text-white">
                  <ClipboardList className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-black leading-tight">Consulte sus compras</h2>
                  <p className="mt-1 text-sm font-bold text-[#777]">Al activar la cédula, puede ver las compras asociadas al documento.</p>
                </div>
              </div>

              <div className="space-y-4">
                <TutorialTip title="¿Dónde veo mis compras?">
                  En la parte de abajo de la tienda aparece el perfil del padre de familia con el historial de compras registradas.
                </TutorialTip>

                <BrowserMockup label="Perfil del padre de familia">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-r from-[#00b5bd] to-[#f5c842] text-sm font-black text-white">
                      CC
                    </div>
                    <div>
                      <p className="text-sm font-black">Padre de familia</p>
                      <p className="text-xs font-bold text-[#777]">Cédula activada · Historial visible</p>
                    </div>
                  </div>
                  <p className="mb-2 text-base font-black">Compras registradas</p>
                  {[
                    ["Crispetas saladas", "Hoy · Autogestión", "AUTOGESTIÓN", 2000],
                    ["Entrada VIP", "Ayer · Caja", "CAJA", 60000],
                    ["Perro", "Lun · Autogestión", "AUTOGESTIÓN", 5000],
                  ].map(([name, meta, badge, price]) => (
                    <div key={String(name)} className="flex items-center justify-between border-b border-[#e8ddd0] py-3 last:border-0">
                      <div>
                        <p className="text-sm font-black">{name}</p>
                        <p className="text-xs font-bold text-[#777]">{meta}</p>
                        <span className={cn("mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black", badge === "CAJA" ? "border-[#ffadd4] bg-[#fff0f6] text-[#d4006a]" : "border-[#b2e8e8] bg-[#e6faf9] text-[#008a91]")}>
                          {badge}
                        </span>
                      </div>
                      <p className="font-black text-[#d4006a]">{formatCurrency(Number(price))}</p>
                    </div>
                  ))}
                </BrowserMockup>

                <TutorialTip title="Si no aparece una compra" tone="warn">
                  Las transferencias por DaviPlata/Bre-B pueden tardar unos minutos en validarse. Si el problema persiste, muestre el comprobante al colegio.
                </TutorialTip>
              </div>
            </div>

            <div className="rounded-3xl border border-[#e8ddd0] bg-white p-6 text-center shadow-[0_10px_28px_rgba(26,26,26,0.06)]">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-r from-[#00b5bd] to-[#f5c842] text-white">
                <PackageCheck className="h-10 w-10" />
              </div>
              <h2 className="text-2xl font-black">Tutorial completado</h2>
              <p className="mx-auto mt-2 max-w-md text-sm font-bold leading-6 text-[#777]">
                Ya conoce los pasos principales para usar la Autogestión de Colgemelli antes de realizar la compra.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Button variant="outline" className="h-11 rounded-xl" onClick={resetTutorial}>
                  <RefreshCcw className="h-4 w-4" />
                  Ver de nuevo
                </Button>
                <Button asChild className="h-11 rounded-xl bg-gradient-to-r from-[#00b5bd] to-[#f5c842] font-black text-white">
                  <Link href="/self-service">
                    Ir a la tienda
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => goToStep(3)}>
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="text-xs font-black text-[#777]">PASO 5 DE 5</span>
              <span />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
