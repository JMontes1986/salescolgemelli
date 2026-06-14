
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  Bot,
  Clock,
  Loader2,
  LogIn,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingCart,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuditLog, AuditLogAction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getAuditLogs } from "@/lib/services/audit-service";
import { useToast } from "@/hooks/use-toast";

type AuditFilter = "all" | "access" | "money" | "self-service" | "inventory";
type AiStatus = "idle" | "loading" | "ready" | "error" | "disabled";

type SecurityAuditorResponse = {
  answer?: string;
  model?: string;
  error?: string;
  detail?: string;
};

const actionLabels: Record<AuditLogAction, string> = {
  TICKET_ISSUE: "Preventa",
  TICKET_SELL: "Venta POS",
  TICKET_REDEEM: "Entrega",
  TICKET_VOID: "Cancelación",
  CASHBOX_OPEN: "Caja abierta",
  CASHBOX_CLOSE: "Caja cerrada",
  USER_ROLE_CHANGE: "Usuarios",
  PAYMENT_CONFIRM: "Pago confirmado",
  STOCK_RESTOCK: "Reintegro stock",
  PURCHASE_EDIT: "Compra editada",
  USER_LOGIN: "Ingreso",
  SELF_SERVICE_PURCHASE: "Autogestión",
  SELF_SERVICE_HISTORY: "Historial",
  PRODUCT_CREATE: "Producto creado",
  PRODUCT_UPDATE: "Producto editado",
  RETURN_PROCESS: "Devolución",
};

const filterLabels: Record<AuditFilter, string> = {
  all: "Todo",
  access: "Ingresos",
  money: "Dinero",
  "self-service": "Autogestión",
  inventory: "Inventario",
};

const filterActions: Record<Exclude<AuditFilter, "all">, AuditLogAction[]> = {
  access: ["USER_LOGIN", "USER_ROLE_CHANGE"],
  money: [
    "TICKET_ISSUE",
    "TICKET_SELL",
    "PAYMENT_CONFIRM",
    "TICKET_VOID",
    "CASHBOX_OPEN",
    "CASHBOX_CLOSE",
  ],
  "self-service": [
    "SELF_SERVICE_PURCHASE",
    "SELF_SERVICE_HISTORY",
    "PURCHASE_EDIT",
  ],
  inventory: [
    "TICKET_REDEEM",
    "STOCK_RESTOCK",
    "PRODUCT_CREATE",
    "PRODUCT_UPDATE",
    "RETURN_PROCESS",
  ],
};

const getActionVariant = (action: AuditLogAction) => {
    switch (action) {
        case 'TICKET_ISSUE':
        case 'USER_ROLE_CHANGE':
        case 'PRODUCT_CREATE':
        case 'PRODUCT_UPDATE':
            return 'bg-blue-500/20 text-blue-700';
        case 'TICKET_SELL':
        case 'PAYMENT_CONFIRM':
        case 'SELF_SERVICE_PURCHASE':
            return 'bg-green-500/20 text-green-700';
        case 'TICKET_REDEEM':
        case 'STOCK_RESTOCK':
        case 'SELF_SERVICE_HISTORY':
        case 'RETURN_PROCESS':
            return 'bg-purple-500/20 text-purple-700';
        case 'TICKET_VOID':
        case 'CASHBOX_CLOSE':
        case 'PURCHASE_EDIT':
            return 'bg-yellow-500/20 text-yellow-700';
        case 'USER_LOGIN':
        case 'CASHBOX_OPEN':
            return 'bg-sky-500/20 text-sky-700';
        default:
            return 'bg-gray-500/20 text-gray-700';
    }
}

function redactSensitiveText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[correo]")
    .replace(
      /\b(?:c[eé]dula|celular|tel[eé]fono|cliente)\s*[:#-]?\s*[0-9A-Za-z+().\s-]{4,30}/gi,
      "[dato cliente]",
    )
    .replace(/\b(?:CG|PV)[0-9A-Za-z_-]{3,}\b/g, "[codigo]")
    .replace(/\b(?:token|api[_ -]?key|bearer|authorization)\s*[:=]?\s*[0-9A-Za-z._-]{8,}/gi, "[secreto]")
    .replace(/\b[0-9a-f]{16,}\b/gi, "[token]")
    .replace(/\b\d{5,}\b/g, "[dato]");
}

function isSameLocalDay(dateValue: string, now = new Date()) {
  const date = new Date(dateValue);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export default function AuditPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<AuditFilter>("all");
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiError, setAiError] = useState("");
  const { toast } = useToast();

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedLogs = await getAuditLogs();
      setAuditLogs(fetchedLogs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los registros de auditoría." });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);


  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const stats = useMemo(() => {
    const todayLogs = auditLogs.filter((log) => isSameLocalDay(log.timestamp));

    return {
      total: auditLogs.length,
      today: todayLogs.length,
      access: auditLogs.filter((log) => filterActions.access.includes(log.action)).length,
      money: auditLogs.filter((log) => filterActions.money.includes(log.action)).length,
      selfService: auditLogs.filter((log) => filterActions["self-service"].includes(log.action)).length,
      inventory: auditLogs.filter((log) => filterActions.inventory.includes(log.action)).length,
    };
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return auditLogs.filter((log) => {
      const matchesFilter =
        activeFilter === "all" || filterActions[activeFilter].includes(log.action);
      const matchesQuery =
        !normalizedQuery ||
        [
          log.userName,
          log.userId,
          log.action,
          actionLabels[log.action],
          log.details,
          log.timestamp,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [activeFilter, auditLogs, query]);

  const latestActivityLabel = auditLogs[0]
    ? new Date(auditLogs[0].timestamp).toLocaleString()
    : "Sin actividad";

  const runAiAnalysis = useCallback(async () => {
    const recentLogs = auditLogs.slice(0, 80).map((log) => ({
      timestamp: log.timestamp,
      userName: redactSensitiveText(log.userName),
      action: log.action,
      label: actionLabels[log.action],
      details: redactSensitiveText(log.details),
    }));

    setAiStatus("loading");
    setAiAnswer("");
    setAiError("");

    try {
      const response = await fetch("/api/security-auditor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "audit-log-intelligence",
          prompt:
            "Analiza esta bitácora de auditoría de la aplicación. Resume qué está pasando, marca actividad sensible, patrones inusuales, acciones de autogestión, ingresos al sistema, ventas/pagos/caja e inventario. Devuelve máximo 5 puntos accionables para administrador.",
          context: {
            route: "/dashboard/audit",
            totals: stats,
            latestActivity: latestActivityLabel,
            recentLogs,
            implementedControls:
              "La bitácora redactada se envía sin userId, cédulas, celulares, tokens, códigos de compra ni secretos. El esquema usa purchases/products/returns/cashboxSessions/auditLogs; no existen orders/payments.",
            privacy:
              "Los identificadores personales, códigos, tokens, secretos y valores largos ya fueron redactados; no pidas secretos ni expongas datos privados.",
          },
        }),
      });

      const data = (await response.json()) as SecurityAuditorResponse;

      if (!response.ok) {
        setAiStatus(response.status === 503 ? "disabled" : "error");
        setAiError(data.error || "La IA no pudo analizar la bitácora.");
        return;
      }

      setAiAnswer(data.answer || "");
      setAiModel(data.model || "");
      setAiStatus("ready");
    } catch (error) {
      setAiStatus("error");
      setAiError(
        error instanceof Error
          ? error.message
          : "No se pudo conectar con la IA de auditoría.",
      );
    }
  }, [auditLogs, latestActivityLabel, stats]);

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Registro de Auditoría"
        description="Revise ingresos, ventas, pagos, caja, inventario, usuarios y actividad de autogestión."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardDescription>Total registrado</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Activity className="h-5 w-5 text-primary" />
              {stats.total}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Último: {latestActivityLabel}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardDescription>Hoy</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Clock className="h-5 w-5 text-primary" />
              {stats.today}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Eventos del día actual
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardDescription>Ingresos</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <LogIn className="h-5 w-5 text-primary" />
              {stats.access}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Login y cambios de usuarios
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardDescription>Dinero</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShoppingCart className="h-5 w-5 text-primary" />
              {stats.money}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Ventas, pagos y caja
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardDescription>Autogestión</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShieldAlert className="h-5 w-5 text-primary" />
              {stats.selfService}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Compras, edición e historial
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Análisis IA
              </CardTitle>
              <CardDescription>
                Evalúa los últimos registros para detectar actividad sensible y patrones relevantes.
              </CardDescription>
            </div>
            <Button onClick={runAiAnalysis} disabled={isLoading || auditLogs.length === 0 || aiStatus === "loading"}>
              {aiStatus === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
              Analizar bitácora
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {aiStatus === "ready" ? (
            <div className="space-y-2 rounded-md border bg-muted/40 p-4 text-sm leading-6">
              <p className="whitespace-pre-wrap">{aiAnswer}</p>
              {aiModel && <p className="text-xs text-muted-foreground">Modelo: {aiModel}</p>}
            </div>
          ) : aiStatus === "error" || aiStatus === "disabled" ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {aiError}
            </div>
          ) : (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              La IA está lista para revisar ingresos, autogestión, ventas, pagos, caja e inventario.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Registro de Actividad</CardTitle>
              <CardDescription>
                Todas las acciones registradas se muestran con la más reciente primero.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={loadLogs} disabled={isLoading}>
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              Recargar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por usuario, acción, código o detalle"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(filterLabels) as AuditFilter[]).map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  variant={activeFilter === filter ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveFilter(filter)}
                >
                  {filterLabels[filter]}
                </Button>
              ))}
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca de Tiempo</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Detalles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    Cargando registros...
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No hay registros para este filtro.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>{log.userName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-mono", getActionVariant(log.action))}>
                          {actionLabels[log.action] ?? log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.details}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

    
