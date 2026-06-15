"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary captured an error.");
    void error.digest;
  }, [error]);

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">No se pudo cargar esta vista</h1>
        <p className="text-sm text-muted-foreground">
          La información técnica quedó oculta para proteger la aplicación.
        </p>
        <Button type="button" onClick={reset}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}
