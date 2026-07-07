import type { Metadata } from "next";
import { CashierTutorial } from "@/components/tutorials/cashier-tutorial";

export const metadata: Metadata = {
  title: "Tutorial para Cajas - Ventas ColGemelli",
  description: "Guía pública para que el equipo de caja revise ventas, devoluciones y validación de autogestión antes de iniciar sesión.",
};

export default function PublicCashierTutorialPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <CashierTutorial variant="public" />
      </div>
    </main>
  );
}
