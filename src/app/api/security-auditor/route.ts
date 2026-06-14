import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const SECURITY_AUDITOR_MODEL =
  process.env.GROQ_SECURITY_MODEL || "openai/gpt-oss-safeguard-20b";

const MAX_PROMPT_LENGTH = 4000;

const DASHBOARD_SECURITY_EVIDENCE = [
  "Estado real de /dashboard en este checkout:",
  "- El esquema financiero no usa tablas orders/payments; el flujo actual usa purchases, products, returns, cashboxSessions y auditLogs.",
  "- /dashboard/layout.tsx valida permisos por ruta en el cliente para dashboard, sales, presale, self-service, products, redeem, cashbox, returns, users y audit.",
  "- Supabase RLS está habilitado para users, products, purchases, returns, auditLogs, cashboxSessions y counters.",
  "- Las operaciones críticas de ventas, autogestión, confirmación de pago, entrega, QR y counters pasan por RPC security definer con validación de entrada y permisos donde aplica.",
  "- La auditoría persistente usa record_audit_log con lista cerrada de acciones: login, ventas, pagos, caja, inventario, devoluciones, usuarios y autogestión.",
  "- Los QR de entrega usan token HMAC con expiración; el lookup por QR firmado valida orderId y deliveryCode antes de entregar.",
  "- El cliente no debe enviar ni recibir claves API, tokens privados ni credenciales de pago; GROQ_API_KEY vive solo en servidor.",
  "- Riesgo residual conocido: MFA y expiración de 15 minutos dependen de configuración de Supabase Auth/deployment y no se pueden demostrar desde el código cliente.",
  "- Riesgo residual conocido: el control de ruta del dashboard es UX/cliente; la defensa de datos debe mantenerse en RLS y RPC.",
].join("\n");

const SECURITY_AUDITOR_SYSTEM_PROMPT = `You are a senior security auditor embedded inside a Colombian school sales platform. You protect money-impacting workflows, customer privacy, inventory integrity, payment confirmation, delivery codes, role-based access, Supabase RLS, and audit evidence.

When reviewing a screen or flow: define scope, identify vulnerabilities, classify risk as Critical, High, Medium, Low, or Observation, and provide concise actionable remediation.

Use the supplied application context as the source of truth. If the context states that a control is already implemented, omit that item from the final answer entirely. Never include a Mitigated/Mitigado section, row, or status for resolved controls. Only list concrete active or residual risk that is still true. Do not invent schema tables, endpoints, or resources that are not mentioned in the context. For /dashboard, never recommend orders/payments tables unless the context explicitly says they exist.

Keep responses practical for operators and developers. Never ask users to paste secrets. Never expose API keys, tokens, private customer data, or payment credentials. If the request involves customer records, recommend minimum necessary data and server-side validation.`;

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

  return JSON.stringify(value).slice(0, 2000);
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
    : baseContext;
  const mode = getPromptValue(payload.mode) || "interactive";

  const groqResponse = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SECURITY_AUDITOR_MODEL,
      messages: [
        {
          role: "system",
          content: SECURITY_AUDITOR_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            `Modo: ${mode}`,
            `Contexto de aplicación: ${context}`,
            `Solicitud: ${prompt}`,
          ].join("\n\n"),
        },
      ],
      temperature: 1,
      max_completion_tokens: 1200,
      top_p: 1,
      reasoning_effort: "medium",
      stream: false,
      stop: null,
    }),
    cache: "no-store",
  });

  if (!groqResponse.ok) {
    const errorText = await groqResponse.text();

    return NextResponse.json(
      {
        error: `Groq no pudo completar la auditoría (${groqResponse.status}).`,
        detail: errorText.slice(0, 500),
      },
      { status: 502 },
    );
  }

  const completion = (await groqResponse.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawAnswer = completion.choices?.[0]?.message?.content?.trim();
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

  return NextResponse.json({
    answer,
    model: SECURITY_AUDITOR_MODEL,
  });
}
