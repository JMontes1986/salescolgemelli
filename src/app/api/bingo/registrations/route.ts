import { NextResponse } from "next/server";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

type BingoRegistrationBody = {
  fullName?: unknown;
  documentNumber?: unknown;
  phone?: unknown;
  email?: unknown;
  gradeCourse?: unknown;
  studentName?: unknown;
  attendees?: unknown;
  tables?: unknown;
  notes?: unknown;
  privacy?: unknown;
};

const textPattern = /^[\p{L}\p{N}\s.,#@_+\-()/áéíóúÁÉÍÓÚñÑüÜ]{0,220}$/u;
const phonePattern = /^[0-9+\-\s().]{7,30}$/;

function cleanText(value: unknown, maxLength = 180) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parsePositiveInteger(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function validateText(label: string, value: string, required = false) {
  if (required && !value) {
    return `${label} es obligatorio.`;
  }

  if (value && !textPattern.test(value)) {
    return `${label} contiene caracteres no permitidos.`;
  }

  return null;
}

async function insertRegistration(row: Record<string, unknown>) {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/bingo_registrations`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
      cache: "no-store",
    },
  );
  const responseText = await response.text();

  if (!response.ok) {
    let message = responseText || "No se pudo guardar la confirmacion.";

    try {
      const parsed = JSON.parse(responseText) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        message = parsed.message;
      }
    } catch {
      // Keep the original response text.
    }

    return { ok: false as const, status: response.status, message };
  }

  return {
    ok: true as const,
    registration: responseText ? (JSON.parse(responseText) as unknown[])?.[0] : null,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BingoRegistrationBody;
    const fullName = cleanText(body.fullName);
    const documentNumber = cleanText(body.documentNumber, 80);
    const phone = cleanText(body.phone, 40);
    const email = cleanText(body.email, 180);
    const gradeCourse = cleanText(body.gradeCourse, 80);
    const studentName = cleanText(body.studentName);
    const notes = cleanText(body.notes, 800);
    const attendees = parsePositiveInteger(body.attendees, 1, 30);
    const tables = parsePositiveInteger(body.tables, 1, 99);

    const validationErrors = [
      validateText("Nombre completo", fullName, true),
      validateText("Numero de documento", documentNumber),
      validateText("Telefono", phone, true),
      validateText("Grado o curso", gradeCourse, true),
      validateText("Nombre del estudiante", studentName, true),
      validateText("Observaciones", notes),
    ].filter(Boolean);

    if (phone && !phonePattern.test(phone)) {
      validationErrors.push("Telefono no tiene un formato valido.");
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      validationErrors.push("Correo no tiene un formato valido.");
    }

    if (body.privacy !== true) {
      validationErrors.push("Debes autorizar el tratamiento de datos personales.");
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { message: validationErrors[0] },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const saved = await insertRegistration({
      full_name: fullName,
      document_number: documentNumber,
      phone,
      email,
      grade_course: gradeCourse,
      student_name: studentName,
      attendees,
      tables,
      notes,
      source: "bingo_landing",
    });

    if (!saved.ok) {
      return NextResponse.json(
        { message: saved.message },
        {
          status: saved.status >= 400 ? saved.status : 400,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      { registration: saved.registration },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Bingo registration failed.", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo guardar la confirmacion.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
