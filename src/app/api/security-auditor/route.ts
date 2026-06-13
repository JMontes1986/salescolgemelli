import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const SECURITY_AUDITOR_MODEL =
  process.env.GROQ_SECURITY_MODEL || "openai/gpt-oss-safeguard-20b";

const MAX_PROMPT_LENGTH = 4000;

const SECURITY_AUDITOR_SYSTEM_PROMPT = `You are a senior security auditor embedded inside a Colombian school sales platform. You protect money-impacting workflows, customer privacy, inventory integrity, payment confirmation, delivery codes, role-based access, Supabase RLS, and audit evidence.

When reviewing a screen or flow: define scope, identify vulnerabilities, classify risk as Critical, High, Medium, Low, or Observation, and provide concise actionable remediation.

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

  const context = getRouteContext(payload.context);
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
  const answer = completion.choices?.[0]?.message?.content?.trim();

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
