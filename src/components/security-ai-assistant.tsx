"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type AuditorStatus = "idle" | "loading" | "ready" | "error" | "disabled";

type SecurityAuditorResponse = {
  answer?: string;
  model?: string;
  error?: string;
  detail?: string;
};

const SELF_SERVICE_SECURITY_EVIDENCE = [
  "Estado real de /self-service en este checkout:",
  "- No existe endpoint público de historial por cédula/celular en la UI; la pantalla pública solo muestra compras generadas durante la sesión actual.",
  "- La función get_self_service_purchases_by_customer existe solo como compatibilidad SQL, pero el execute fue revocado para anon/authenticated y el servicio cliente devuelve error si alguien intenta usarla.",
  "- La creación pública de compras no inserta directo en purchases: usa RPC create_self_service_purchase con security definer.",
  "- El cliente envía solo id y quantity del carrito; Supabase vuelve a leer productos, disponibilidad, precio y stock antes de guardar.",
  "- purchases revocó INSERT para anon; anon solo puede ejecutar create_self_service_purchase.",
  "- El QR de entrega usa token HMAC con expiración y validación en get_purchase_for_delivery_lookup.",
  "- El QR/enlace de pago DaviPlata no incluye el monto como parámetro; el total visible viene de la compra confirmada por Supabase.",
  "- Las reservas de autogestión usan reservationExpiresAt con timeout de 30 minutos y el cálculo de disponibilidad ignora reservas vencidas.",
  "- No hay tablas orders, order_items ni payment_logs en este esquema; el flujo actual usa purchases con items jsonb.",
].join("\n");

const DASHBOARD_SECURITY_EVIDENCE = [
  "Estado real de /dashboard en este checkout:",
  "- Las rutas internas usan permisos de módulo: dashboard, sales, presale, products, redeem, cashbox, returns, users y audit; el permiso real para /dashboard/sales es 'sales'.",
  "- Las tablas sensibles del flujo financiero son purchases, products, returns, cashboxSessions, auditLogs, users y counters.",
  "- No existen tablas orders ni payments en el esquema actual.",
  "- purchases/products/returns/cashboxSessions/auditLogs tienen RLS y políticas para usuarios autenticados con permisos.",
  "- Las escrituras autenticadas sobre purchases, products, returns y cashboxSessions exigen permiso de módulo y token emitido hace máximo 15 minutos desde SQL.",
  "- Ventas POS, confirmación de pago/preventa, entrega y QR se validan también en RPC de Supabase; las RPC autenticadas exigen sesión fuerte.",
  "- La auditoría persistente usa record_audit_log con acciones permitidas; acciones no permitidas quedan trazadas como AUDIT_LOG_FAILURE sin ejecutar la acción solicitada.",
  "- Riesgos residuales a vigilar: las rutas cliente no sustituyen RLS/RPC; los permisos y la vigencia del token deben mantenerse en SQL.",
].join("\n");

function getSurfaceFromPath(pathname: string) {
  if (pathname === "/self-service" || pathname.startsWith("/self-service/")) {
    return "Autogestión pública";
  }

  if (pathname.startsWith("/dashboard/sales")) {
    return "Ventas POS";
  }

  if (pathname.startsWith("/dashboard/redeem")) {
    return "Canje y entrega";
  }

  if (pathname.startsWith("/dashboard/cashbox")) {
    return "Caja";
  }

  if (pathname.startsWith("/dashboard/users")) {
    return "Usuarios y roles";
  }

  if (pathname.startsWith("/dashboard/products")) {
    return "Productos e inventario";
  }

  if (pathname.startsWith("/dashboard/audit")) {
    return "Auditoría";
  }

  return pathname.startsWith("/dashboard") ? "Dashboard interno" : "Acceso";
}

function getAutoPrompt(pathname: string) {
  if (pathname === "/self-service" || pathname.startsWith("/self-service/")) {
    return [
      "Revisa la pantalla de autogestión como guardia activo.",
      "Usa la evidencia de seguridad actual incluida en el contexto. Omite por completo cualquier control ya implementado o resuelto.",
      "Si hay riesgo residual, descríbelo como residual y explica la condición concreta que faltaría verificar.",
      "No recomiendes tablas o endpoints que no existan en este proyecto.",
      "Devuelve solo riesgos activos, riesgos residuales y siguientes acciones concretas. No incluyas secciones, filas ni etiquetas llamadas Mitigado.",
    ].join(" ");
  }

  if (pathname.startsWith("/dashboard")) {
    return "Revisa esta pantalla interna como guardia activo. Prioriza roles, permisos, acciones con impacto en dinero, stock, caja, auditoría y trazabilidad. Para cada riesgo activo o residual, indica también la solución ideal de ciberseguridad y el primer paso concreto para aplicarla. Devuelve un resumen breve y accionable para administrador.";
  }

  return "Revisa esta pantalla como guardia activo. Prioriza autenticación, manejo de sesión, exposición de datos y errores visibles.";
}

export function SecurityAiAssistant() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<AuditorStatus>("idle");
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("");
  const [question, setQuestion] = useState("");
  const [lastError, setLastError] = useState("");
  const lastAutoPath = useRef("");
  const isSelfService = pathname === "/self-service" || pathname.startsWith("/self-service/");
  const surface = useMemo(() => getSurfaceFromPath(pathname), [pathname]);

  const runAudit = useCallback(
    async (prompt: string, mode = "interactive") => {
      setStatus("loading");
      setLastError("");

      try {
        const response = await fetch("/api/security-auditor", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt,
            mode,
            context: {
              route: pathname,
              surface,
              priority: isSelfService
                ? "public self-service, payments, QR codes, purchase history"
                : "money-impacting dashboard workflow",
              implementedControls: isSelfService
                ? SELF_SERVICE_SECURITY_EVIDENCE
                : pathname.startsWith("/dashboard")
                  ? DASHBOARD_SECURITY_EVIDENCE
                  : undefined,
              privacy:
                "Do not request or expose customer identifiers, API keys, tokens, or payment credentials.",
            },
          }),
        });

        const data = (await response.json()) as SecurityAuditorResponse;

        if (!response.ok) {
          setAnswer("");
          setLastError(data.error || "La IA de seguridad no respondió.");
          setStatus(response.status === 503 ? "disabled" : "error");
          return;
        }

        setAnswer(data.answer || "");
        setModel(data.model || "");
        setStatus("ready");
      } catch (error) {
        setAnswer("");
        setLastError(
          error instanceof Error
            ? error.message
            : "No se pudo conectar con la IA de seguridad.",
        );
        setStatus("error");
      }
    },
    [isSelfService, pathname, surface],
  );

  useEffect(() => {
    if (lastAutoPath.current === pathname) {
      return;
    }

    lastAutoPath.current = pathname;

    if (isSelfService) {
      setIsOpen(false);
    }

    runAudit(getAutoPrompt(pathname), "active-route-guard");
  }, [isSelfService, pathname, runAudit]);

  const handleAsk = async () => {
    const prompt = question.trim();

    if (!prompt) {
      return;
    }

    setQuestion("");
    await runAudit(prompt, "operator-question");
  };

  return (
    <div
      className={cn(
        "fixed left-3 z-50 sm:left-5",
        isSelfService ? "bottom-24 sm:bottom-6" : "bottom-4 sm:bottom-5",
      )}
    >
      {isOpen && !isSelfService && (
        <section className="mb-3 w-[min(calc(100vw-1.5rem),390px)] overflow-hidden rounded-lg border border-border/80 bg-background/96 text-foreground shadow-2xl shadow-slate-950/20 backdrop-blur supports-[backdrop-filter]:bg-background/90">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/50 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">IA de seguridad</p>
                <p className="truncate text-xs text-muted-foreground">
                  {surface}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar IA de seguridad"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-[42vh] min-h-32 overflow-y-auto px-3 py-3">
            {status === "loading" ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analizando riesgos de esta pantalla...
              </div>
            ) : status === "disabled" ? (
              <div className="flex gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{lastError}</p>
              </div>
            ) : status === "error" ? (
              <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{lastError}</p>
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {answer || "Guardia activo en espera."}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t bg-muted/25 p-3">
            <Textarea
              id="security-ai-question"
              name="securityAiQuestion"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Pregunta de seguridad"
              className="min-h-20 resize-none text-sm"
              maxLength={1000}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs text-muted-foreground">
                {model || "Groq safeguard"}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={handleAsk}
                disabled={status === "loading" || !question.trim()}
              >
                <Send className="h-4 w-4" />
                Enviar
              </Button>
            </div>
          </div>
        </section>
      )}

      {isSelfService ? (
        <div
          className="flex h-12 items-center gap-2 rounded-full bg-[#b23178] px-4 font-bold text-white shadow-xl shadow-slate-950/20 dark:bg-[#b23178]"
          aria-label="IA activa en autogestión"
          role="status"
        >
          <Sparkles className="h-5 w-5" />
          IA activa
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="h-12 rounded-full px-4 font-bold shadow-xl shadow-slate-950/20"
          aria-label="Abrir IA de seguridad"
        >
          {status === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
          IA activa
        </Button>
      )}
    </div>
  );
}
