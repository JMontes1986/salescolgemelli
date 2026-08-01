import { ArrowRight, Eye, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { parseSelfServiceEditAuditDetails } from "@/lib/self-service-edit-audit";

type SelfServiceEditAuditDetailsProps = {
  details: string;
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function SelfServiceEditAuditDetails({
  details,
}: SelfServiceEditAuditDetailsProps) {
  const audit = parseSelfServiceEditAuditDetails(details);

  if (!audit) return <span>{details}</span>;

  const beforeById = new Map(audit.beforeItems.map((item) => [item.id, item]));
  const afterById = new Map(audit.afterItems.map((item) => [item.id, item]));
  const productIds = new Set([...beforeById.keys(), ...afterById.keys()]);
  const changes = [...productIds]
    .map((productId) => {
      const before = beforeById.get(productId);
      const after = afterById.get(productId);
      return {
        id: productId,
        name: after?.name ?? before?.name ?? "Producto",
        beforeQuantity: before?.quantity ?? 0,
        afterQuantity: after?.quantity ?? 0,
        price: after?.price ?? before?.price ?? 0,
      };
    })
    .filter((change) => change.beforeQuantity !== change.afterQuantity);

  const totalDifference = audit.afterTotal - audit.beforeTotal;

  return (
    <div className="space-y-2">
      <p className="text-sm">
        El padre modificó la compra <span className="font-mono font-semibold">{audit.purchaseId}</span>.
      </p>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-8">
            <Eye className="mr-2 h-4 w-4" />
            Ver cambios
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilLine className="h-5 w-5 text-amber-600" />
              Modificación de autogestión
            </DialogTitle>
            <DialogDescription>
              Comparativo guardado para la compra {audit.purchaseId}. Esta evidencia no cambia aunque la compra vuelva a editarse.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total anterior</p>
              <p className="mt-1 text-xl font-semibold">{currencyFormatter.format(audit.beforeTotal)}</p>
            </div>
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">Total después</p>
              <p className="mt-1 text-xl font-semibold">{currencyFormatter.format(audit.afterTotal)}</p>
              <p className="text-xs text-muted-foreground">
                Diferencia: {totalDifference >= 0 ? "+" : ""}{currencyFormatter.format(totalDifference)}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Productos modificados</h3>
            {changes.length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                No hubo cambios de cantidad; únicamente cambió el valor total.
              </p>
            ) : (
              changes.map((change) => {
                const difference = change.afterQuantity - change.beforeQuantity;
                const label = change.beforeQuantity === 0
                  ? "Agregado"
                  : change.afterQuantity === 0
                    ? "Eliminado"
                    : "Cantidad cambiada";

                return (
                  <div key={change.id} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{change.name}</p>
                        <p className="text-xs text-muted-foreground">{currencyFormatter.format(change.price)} por unidad</p>
                      </div>
                      <Badge variant="outline" className="w-fit">{label}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                      <span className="rounded-md bg-muted px-3 py-1.5">Antes: <strong>{change.beforeQuantity}</strong></span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="rounded-md bg-amber-100 px-3 py-1.5 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                        Después: <strong>{change.afterQuantity}</strong>
                      </span>
                      <span className={difference > 0 ? "text-emerald-700" : "text-red-700"}>
                        ({difference > 0 ? "+" : ""}{difference})
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}