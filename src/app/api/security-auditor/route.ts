import { NextResponse } from "next/server";

import { addAuditLog } from "@/lib/services/audit-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const SECURITY_AUDITOR_MODEL =
  process.env.GROQ_SECURITY_MODEL || "openai/gpt-oss-safeguard-20b";

const SECURITY_AUDITOR_FALLBACK_MODELS = (
  process.env.GROQ_SECURITY_FALLBACK_MODELS || "llama-3.1-8b-instant"
)
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

const MAX_PROMPT_LENGTH = 4000;
const MAX_CONTEXT_LENGTH = 2000;
const GROQ_REQUEST_TIMEOUT_MS = 20_000;
const RETRYABLE_GROQ_STATUSES = new Set([
  408, 409, 425, 429, 500, 502, 503, 504,
]);

const SELF_SERVICE_SECURITY_EVIDENCE = [
  "Estado real de /self-service en este checkout:",
  "- /self-service es un portal público por diseño; permitir que anon ejecute create_self_service_purchase no es una brecha por sí solo.",
  "- La creación pública de compras no inserta directo en purchases: usa RPC create_self_service_purchase con security definer, validación de cédula/celular, límite de 30 productos, cantidades 1-99 y bloqueo de filas de productos.",
  "- El cliente envía solo id y quantity del carrito; Supabase vuelve a leer productos, disponibilidad, precio y stock antes de guardar, por lo que no confía en precios ni totales enviados por el navegador.",
  "- purchases revocó INSERT para anon; anon solo puede crear reservas mediante create_self_service_purchase y no tiene lectura directa de purchases.",
  "- No existe endpoint público de historial por cédula/celular en la UI; la pantalla pública solo muestra compras generadas durante la sesión actual.",
  "- La función get_self_service_purchases_by_customer existe solo como compatibilidad SQL, pero el execute fue revocado para anon/authenticated.",
  "- get_purchase_for_delivery_lookup puede ejecutarse desde anon/authenticated, pero cuando recibe QR valida token HMAC con expiración; si recibe código manual, devuelve una compra solo para el flujo de entrega y no debe usarse como historial público.",
  "- Las entregas anónimas requieren QR firmado vigente en deliver_purchase_items_for_lookup; usuarios autenticados requieren permiso redeem y sesión reciente.",
  "- Las reservas de autogestión usan reservationExpiresAt con timeout de 2 horas; el cálculo de disponibilidad y las RPC de compra descuentan solo reservas pendientes no vencidas (reservationExpiresAt > now()).",
  "- Riesgo residual real: como todo formulario público, autogestión puede recibir abuso automatizado o reservas falsas; la mitigación ideal es rate limiting/CAPTCHA o validación de pago fuera de Supabase RLS.",
  "- No hay tablas orders, order_items ni payment_logs en este esquema; el flujo actual usa purchases con items jsonb.",
].join("\n");

const DASHBOARD_SECURITY_EVIDENCE = [
  "Estado real de /dashboard en este checkout:",
  "- El esquema financiero no usa tablas orders/payments; el flujo actual usa purchases, products, returns, cashboxSessions y auditLogs.",
  "- /dashboard/layout.tsx valida permisos por ruta en el cliente para dashboard, sales, presale, self-service, products, redeem, cashbox, returns, users y audit.",
  "- Supabase RLS está habilitado para users, products, purchases, returns, auditLogs, cashboxSessions y counters; counters no tiene acceso directo para anon/authenticated y solo se incrementa desde RPC security definer.",
  "- Las operaciones críticas de ventas POS, autogestión, confirmación de pago, entrega, QR y counters pasan por RPC security definer con validación de entrada y permisos SQL; /dashboard/sales usa permisos 'sales' en este esquema, no 'dashboard.sales'.",
  "- Las escrituras autenticadas de dashboard sobre purchases, products, returns y cashboxSessions exigen sesión fuerte en SQL: permiso de módulo y token emitido hace máximo 15 minutos.",
  "- Las RPC autenticadas de venta POS, confirmación de pago/preventa y entrega también exigen permiso de módulo y sesión reciente antes de modificar datos financieros.",
  "- La auditoría persistente usa record_audit_log con lista cerrada de acciones; intentos de registrar acciones no permitidas se guardan como AUDIT_LOG_FAILURE sin ejecutar la acción solicitada.",
  "- Los QR de entrega usan token HMAC con expiración; el lookup por QR firmado valida orderId y deliveryCode antes de entregar.",
  "- El cliente no debe enviar ni recibir claves API, tokens privados ni credenciales de pago; GROQ_API_KEY vive solo en servidor.",
  "- Requisito operativo: los perfiles public.users deben estar alineados con auth.uid() y el usuario debe volver a iniciar sesión si el token supera 15 minutos.",
  "- Riesgo residual conocido: el control de ruta del dashboard es UX/cliente; la defensa de datos debe mantenerse en RLS y RPC.",
].join("\n");

const SECURITY_AUDITOR_SYSTEM_PROMPT = `You are a senior security auditor embedded inside a Colombian school sales platform. You protect money-impacting workflows, customer privacy, inventory integrity, payment confirmation, delivery codes, role-based access, Supabase RLS, and audit evidence.

When reviewing a screen or flow: define scope, identify vulnerabilities, classify risk as Critical, High, Medium, Low, or Observation, and provide concise actionable remediation. For administrator dashboard contexts, every active or residual issue must include the ideal cybersecurity solution plus the first practical implementation step, not only a problem description.

Use the supplied application context as the source of truth. If the context states that a control is already implemented, omit that item from the final answer entirely. Never include a Mitigated/Mitigado section, row, or status for resolved controls. Only list concrete active or residual risk that is still true. Do not invent schema tables, endpoints, or resources that are not mentioned in the context. For /dashboard, never recommend orders/payments tables unless the context explicitly says they exist. For /self-service, do not report the intentionally public create_self_service_purchase RPC as unauthorized access unless you can point to a concrete missing validation that is not contradicted by the supplied context.

Keep responses practical for operators and developers. Never ask users to paste secrets. Never expose API keys, tokens, private customer data, or payment credentials. If the request involves customer records, recommend minimum necessary data and server-side validation.`;

function getGroqModelCandidates() {
  return Array.from(
    new Set([SECURITY_AUDITOR_MODEL, ...SECURITY_AUDITOR_FALLBACK_MODELS]),
  );
}

function supportsReasoningEffort(model: string) {
  return model.startsWith("openai/gpt-oss");
}

function formatPrimitiveAsToon(value: string | number | boolean | null): string {
  if (value === null) {
    return "null";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function formatValueAsToon(value: unknown, indent = ""): string {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return formatPrimitiveAsToon(value as string | number | boolean | null);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    return value
      .map((item) => `${indent}- ${formatValueAsToon(item, `${indent}  `)}`)
      .join("\n");
  }

  if (typeof value === "object" && value) {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined,
    );

    if (entries.length === 0) {
      return "{}";
    }

    return entries
      .map(([key, entryValue]) => {
        const formattedValue = formatValueAsToon(entryValue, `${indent}  `);

        if (formattedValue.includes("\n")) {
          return `${indent}${key}:\n${formattedValue}`;
        }

        return `${indent}${key}: ${formattedValue}`;
      })
      .join("\n");
  }

  return "";
}

function buildAiInputToon(mode: string, context: string, prompt: string): string {
  return [
    "formato: TOON",
    `modo: ${formatPrimitiveAsToon(mode)}`,
    "contexto:",
    context,
    "solicitud:",
    prompt,
  ].join("\n");
}

function buildGroqRequestBody(model: string, mode: string, context: string, prompt: string) {
  return {
    model,
    messages: [
      {
        role: "system",
        content: SECURITY_AUDITOR_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: buildAiInputToon(mode, context, prompt),
      },
    ],
    temperature: 1,
    max_completion_tokens: 1200,
    top_p: 1,
    ...(supportsReasoningEffort(model) ? { reasoning_effort: "medium" } : {}),
    stream: false,
    stop: null,
  };
}

async function requestSingleGroqCompletion(
  apiKey: string,
  model: string,
  mode: string,
  context: string,
  prompt: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(GROQ_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGroqRequestBody(model, mode, context, prompt)),
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGroqCompletion(
  apiKey: string,
  mode: string,
  context: string,
  prompt: string,
) {
  const modelCandidates = getGroqModelCandidates();
  let lastErrorText = "";
  let lastStatus = 0;

  for (const model of modelCandidates) {
    let groqResponse: Response;

    try {
      groqResponse = await requestSingleGroqCompletion(
        apiKey,
        model,
        mode,
        context,
        prompt,
      );
    } catch (error) {
      lastStatus = 503;
      lastErrorText =
        error instanceof Error
          ? error.message
          : "Groq no respondió antes del tiempo límite.";
      continue;
    }

    if (groqResponse.ok) {
      const completion = (await groqResponse.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      return {
        answer: completion.choices?.[0]?.message?.content?.trim() || "",
        model,
      };
    }

    lastStatus = groqResponse.status;
    lastErrorText = await groqResponse.text();

    if (!RETRYABLE_GROQ_STATUSES.has(groqResponse.status)) {
      break;
    }
  }

  return {
    error: `Groq no pudo completar la auditoría (${lastStatus}).`,
    detail: lastErrorText.slice(0, 500),
    status: lastStatus,
  };
}

function getActiveGuardFallbackAnswer(context: string) {
  if (/^route: \/self-service$/m.test(context)) {
    return "IA de seguridad activa en autogestión. Groq está temporalmente limitado; se mantiene la vigilancia base con controles locales y se reintentará cuando el límite se libere.";
  }

  return "IA de seguridad activa. Groq está temporalmente limitado; revisa roles, MFA reciente, permisos SQL/RLS, caja, stock y trazabilidad antes de ejecutar acciones críticas.";
}

function getPromptValue(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, MAX_PROMPT_LENGTH);
}

function getRouteContext(value: unknown) {
  if (!value || typeof value !== "object") {
    return "Sin contexto adicional.";
  }

  return formatValueAsToon(value).slice(0, MAX_CONTEXT_LENGTH);
}

function isSelfServiceContext(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (value as { route?: unknown }).route === "/self-service";
}

function isDashboardContext(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const route = (value as { route?: unknown }).route;
  return typeof route === "string" && route.startsWith("/dashboard");
}

function stripMitigatedContent(answer: string) {
  const mitigatedPattern = /\bmitigad[oa]s?\b/i;

  return answer
    .split(/\r?\n/)
    .filter((line) => !mitigatedPattern.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function redactSecurityAlertDetails(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[correo]")
    .replace(
      /\b(?:c[eé]dula|celular|tel[eé]fono|cliente)\s*[:#-]?\s*[0-9A-Za-z+().\s-]{4,30}/gi,
      "[dato cliente]",
    )
    .replace(/\b(?:CG|PV)[0-9A-Za-z_-]{3,}\b/g, "[codigo]")
    .replace(/\b(?:token|api[_ -]?key|bearer|authorization)\s*[:=]?\s*[0-9A-Za-z._-]{8,}/gi, "[secreto]")
    .replace(/\b[0-9a-f]{16,}\b/gi, "[token]")
    .replace(/\b\d{5,}\b/g, "[dato]")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldNotifySelfServiceSecurityAlert(answer: string, mode: string) {
  if (mode !== "active-route-guard") {
    return false;
  }

  const normalizedAnswer = answer.toLowerCase();

  if (
    /no (quedan|hay|se detectaron|identifiqu[eé]) (hallazgos|riesgos|brechas|ataques)/i.test(
      normalizedAnswer,
    )
  ) {
    return false;
  }

  return /\b(brecha|ataque|atacante|explotaci[oó]n|vulnerabilidad|inyecci[oó]n|xss|csrf|phishing|fuga|filtraci[oó]n|exposici[oó]n|cr[ií]tic[oa]|critical|alto|high)\b/i.test(
    answer,
  );
}

async function notifySelfServiceSecurityAlert(answer: string) {
  const summary = redactSecurityAlertDetails(answer).slice(0, 900);

  try {
    await addAuditLog({
      userId: "security-ai:self-service",
      userName: "IA seguridad autogestión",
      action: "SELF_SERVICE_SECURITY_ALERT",
      details: `La IA de seguridad detectó una posible brecha, ataque o riesgo alto en autogestión. Revisar y validar desde Seguridad/Auditoría. Resumen: ${summary}`,
    });
  } catch (error) {
    console.warn("No se pudo notificar alerta de seguridad de autogestión.", error);
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "La IA de seguridad no está configurada. Define GROQ_API_KEY en las variables privadas del servidor.",
      },
      { status: 503 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "La solicitud de auditoría no tiene un JSON válido." },
      { status: 400 },
    );
  }

  const payload = body as {
    prompt?: unknown;
    context?: unknown;
    mode?: unknown;
  };
  const prompt = getPromptValue(payload.prompt);

  if (!prompt) {
    return NextResponse.json(
      { error: "Escribe una solicitud para la IA de seguridad." },
      { status: 400 },
    );
  }

  const baseContext = getRouteContext(payload.context);
  const shouldHideMitigatedContent = isSelfServiceContext(payload.context);
  const context = isDashboardContext(payload.context)
    ? [baseContext, DASHBOARD_SECURITY_EVIDENCE].join("\n\n")
    : isSelfServiceContext(payload.context)
      ? [baseContext, SELF_SERVICE_SECURITY_EVIDENCE].join("\n\n")
      : baseContext;
  const mode = getPromptValue(payload.mode) || "interactive";

  const groqResult = await requestGroqCompletion(apiKey, mode, context, prompt);

  if ("error" in groqResult) {
    if (
      mode === "active-route-guard" ||
      RETRYABLE_GROQ_STATUSES.has(groqResult.status ?? 0)
    ) {
      return NextResponse.json({
        answer: getActiveGuardFallbackAnswer(context),
        model: `${SECURITY_AUDITOR_MODEL} (modo local temporal)`,
      });
    }

    return NextResponse.json(
      {
        error: groqResult.error,
        detail: groqResult.detail,
      },
      { status: groqResult.status === 429 ? 429 : 502 },
    );
  }

  const rawAnswer = groqResult.answer;
  const answer = rawAnswer
    ? shouldHideMitigatedContent
      ? stripMitigatedContent(rawAnswer) ||
        "No quedan hallazgos activos para mostrar en autogestión."
      : rawAnswer
    : "";

  if (!answer) {
    return NextResponse.json(
      { error: "Groq no devolvió contenido para la auditoría." },
      { status: 502 },
    );
  }

  if (
    shouldHideMitigatedContent &&
    shouldNotifySelfServiceSecurityAlert(answer, mode)
  ) {
    await notifySelfServiceSecurityAlert(answer);
  }

  const responseAnswer =
    shouldHideMitigatedContent
      ? "IA de seguridad activa en autogestión. Si detecta una posible brecha, ataque o riesgo alto, notificará a Seguridad/Auditoría para revisión administrativa."
      : answer;

  return NextResponse.json({
    answer: responseAnswer,
    model: groqResult.model,
  });
}
