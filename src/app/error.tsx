"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error boundary captured an error.");
    void error.digest;
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Algo salió mal</h1>
        <p className="text-sm text-muted-foreground">
          No pudimos completar la acción. Inténtalo de nuevo o vuelve al acceso.
        </p>
        <div className="flex justify-center gap-3">
          <Button type="button" onClick={reset}>
            Reintentar
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href="/">Ir al acceso</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
