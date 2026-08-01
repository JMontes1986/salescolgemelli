import { PencilLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Purchase } from "@/lib/types";

type PurchaseModifiedIndicatorProps = {
  purchase: Purchase;
  audience?: "parent" | "staff";
  className?: string;
  showDetails?: boolean;
};

function formatModifiedAt(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

export function PurchaseModifiedIndicator({
  purchase,
  audience = "staff",
  className,
  showDetails = false,
}: PurchaseModifiedIndicatorProps) {
  const modificationCount = purchase.modificationCount ?? 0;
  const isModified = modificationCount > 0 || Boolean(purchase.modifiedAt);

  if (!isModified) return null;

  const modifiedAtLabel = formatModifiedAt(purchase.modifiedAt);
  const countLabel =
    modificationCount > 1 ? ` · ${modificationCount} cambios` : "";

  if (!showDetails) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 border-amber-400 bg-amber-50 text-amber-900",
          className,
        )}
      >
        <PencilLine className="h-3.5 w-3.5" />
        Pedido modificado{countLabel}
      </Badge>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950",
        className,
      )}
      role="status"
    >
      <div className="flex items-start gap-2">
        <PencilLine className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">
            {audience === "parent"
              ? "Este pedido fue modificado"
              : "El padre modificó este pedido"}
            {countLabel}
          </p>
          <p className="mt-0.5 text-sm">
            {modifiedAtLabel
              ? `Última modificación: ${modifiedAtLabel}.`
              : "Revise las cantidades y productos actualizados antes de continuar."}
            {audience === "staff"
              ? " Revise los productos antes de confirmar el pago o la entrega."
              : " Los productos y el total mostrados corresponden a la versión actual."}
          </p>
        </div>
      </div>
    </div>
  );
}
