"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type CleanupEntity = "purchase" | "return" | "cashbox" | "bingo";

type CleanupRecord = {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  amount?: number;
  badge: string;
  searchText: string;
};

const entityOptions: Array<{
  value: CleanupEntity;
  label: string;
  description: string;
  icon: typeof ShoppingCart;
}> = [
  {
    value: "purchase",
    label: "Compras y ventas",
    description: "POS, autogestión y preventas",
    icon: ShoppingCart,
  },
  {
    value: "return",
    label: "Devoluciones",
    description: "Reintegros registrados",
    icon: Undo2,
  },
  {
    value: "cashbox",
    label: "Sesiones de caja",
    description: "Aperturas y cierres",
    icon: Archive,
  },
  {
    value: "bingo",
    label: "Registros Bingo",
    description: "Inscripciones de familias",
    icon: Users,
  },
];

function formatDate(value: string) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

async function readApiResponse(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | { message?: string; records?: CleanupRecord[]; result?: { inventoryEffect?: string } }
    | null;
  if (!response.ok) {
    throw new Error(body?.message || "La operación no se pudo completar.");
  }
  return body;
}

export default function DataCleanupPage() {
  const [entity, setEntity] = useState<CleanupEntity>("purchase");
  const [records, setRecords] = useState<CleanupRecord[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [recordToDelete, setRecordToDelete] = useState<CleanupRecord | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/dashboard/data-cleanup?entity=${encodeURIComponent(entity)}`,
        { cache: "no-store" },
      );
      const body = await readApiResponse(response);
      setRecords(body?.records ?? []);
    } catch (error) {
      setRecords([]);
      toast({
        variant: "destructive",
        title: "No se pudieron cargar los registros",
        description: error instanceof Error ? error.message : "Intenta nuevamente.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [entity, toast]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    if (!normalizedQuery) return records;
    return records.filter((record) =>
      `${record.title} ${record.subtitle} ${record.badge} ${record.searchText}`
        .toLocaleLowerCase("es")
        .includes(normalizedQuery),
    );
  }, [query, records]);

  const activeOption = entityOptions.find((option) => option.value === entity)!;

  function selectEntity(nextEntity: CleanupEntity) {
    setEntity(nextEntity);
    setQuery("");
    setRecords([]);
  }

  function openDeleteDialog(record: CleanupRecord) {
    setRecordToDelete(record);
    setConfirmation("");
  }

  function closeDeleteDialog() {
    if (isDeleting) return;
    setRecordToDelete(null);
    setConfirmation("");
  }

  async function deleteRecord() {
    if (!recordToDelete || confirmation.trim() !== recordToDelete.id) return;
    setIsDeleting(true);
    try {
      const response = await fetch("/api/dashboard/data-cleanup", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity,
          id: recordToDelete.id,
          confirmation: confirmation.trim(),
        }),
      });
      const body = await readApiResponse(response);
      setRecords((current) =>
        current.filter((record) => record.id !== recordToDelete.id),
      );
      toast({
        title: "Registro eliminado",
        description:
          body?.result?.inventoryEffect || "La limpieza quedó registrada en auditoría.",
      });
      setRecordToDelete(null);
      setConfirmation("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo eliminar",
        description: error instanceof Error ? error.message : "Intenta nuevamente.",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Limpieza de datos de prueba"
        description="Elimina movimientos creados durante pruebas sin entrar a Supabase. Disponible únicamente para administradores."
      >
        <Button variant="outline" onClick={() => void loadRecords()} disabled={isLoading}>
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          Actualizar
        </Button>
      </PageHeader>

      <Alert className="border-amber-500/40 bg-amber-500/10">
        <ShieldAlert className="h-4 w-4 text-amber-700" />
        <AlertTitle>Eliminación permanente y controlada</AlertTitle>
        <AlertDescription>
          Las compras y devoluciones ajustan automáticamente el inventario. Cada
          eliminación deja un evento nuevo en auditoría con el administrador responsable.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit xl:sticky xl:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tipo de actividad</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 p-3 pt-0 sm:grid-cols-2 xl:grid-cols-1">
            {entityOptions.map((option) => {
              const Icon = option.icon;
              const selected = option.value === entity;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectEntity(option.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-transparent hover:border-border hover:bg-muted/60",
                  )}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4", selected && "text-primary")} />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="gap-4 border-b md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>{activeOption.label}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {records.length} registro(s) reciente(s)
              </p>
            </div>
            <div className="relative w-full md:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por código, cliente o detalle"
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Registro</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado / responsable</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-muted-foreground" />
                        Cargando actividad...
                      </TableCell>
                    </TableRow>
                  ) : filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        {query ? "No hay coincidencias para esta búsqueda." : "No hay registros en esta categoría."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="min-w-72">
                          <p className="font-medium">{record.title}</p>
                          <p className="max-w-xl truncate text-xs text-muted-foreground">
                            {record.subtitle}
                          </p>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {record.id}
                          </p>
                        </TableCell>
                        <TableCell className="min-w-44 whitespace-nowrap text-sm">
                          {formatDate(record.date)}
                        </TableCell>
                        <TableCell>
                          {record.badge ? <Badge variant="outline">{record.badge}</Badge> : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium">
                          {typeof record.amount === "number"
                            ? formatCurrency(record.amount)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => openDeleteDialog(record)}
                            aria-label={`Eliminar ${record.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={Boolean(recordToDelete)} onOpenChange={(open) => !open && closeDeleteDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Eliminar registro permanentemente
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Vas a eliminar <strong className="text-foreground">{recordToDelete?.title}</strong>.
                  Esta acción no se puede deshacer.
                </p>
                {entity === "purchase" && (
                  <p className="rounded-md border bg-muted/50 p-3">
                    El sistema calculará y revertirá el efecto de esta compra sobre el inventario.
                  </p>
                )}
                {entity === "return" && (
                  <p className="rounded-md border bg-muted/50 p-3">
                    Las unidades de esta devolución se descontarán nuevamente del inventario.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirmation">
              Escribe <span className="font-mono font-semibold">{recordToDelete?.id}</span> para confirmar
            </Label>
            <Input
              id="delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              disabled={isDeleting}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteRecord()}
              disabled={isDeleting || confirmation.trim() !== recordToDelete?.id}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {isDeleting ? "Eliminando..." : "Eliminar y conciliar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
