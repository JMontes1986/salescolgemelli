"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { siteConfig } from "@/lib/site";

type FormState = {
  fullName: string;
  documentNumber: string;
  phone: string;
  email: string;
  gradeCourse: string;
  studentName: string;
  attendees: string;
  tables: string;
  notes: string;
  privacy: boolean;
};

const initialFormState: FormState = {
  fullName: "",
  documentNumber: "",
  phone: "",
  email: "",
  gradeCourse: "",
  studentName: "",
  attendees: "1",
  tables: "1",
  notes: "",
  privacy: false,
};

function buildWhatsAppUrl(form: FormState) {
  const message = [
    "Hola, quiero confirmar mi asistencia al Bingo Gemellista 2026.",
    `Nombre: ${form.fullName || "Por completar"}`,
    `Telefono: ${form.phone || "Por completar"}`,
    `Estudiante: ${form.studentName || "Por completar"}`,
    `Curso: ${form.gradeCourse || "Por completar"}`,
    `Asistentes: ${form.attendees || "1"}`,
    `Tablas: ${form.tables || "1"}`,
  ].join("\n");

  return `https://wa.me/${siteConfig.bingoWhatsAppNumber}?text=${encodeURIComponent(message)}`;
}

export function BingoRegistrationForm() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const whatsappUrl = useMemo(() => buildWhatsAppUrl(form), [form]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/bingo/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          attendees: Number(form.attendees),
          tables: Number(form.tables),
        }),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo enviar la confirmacion.");
      }

      setStatus("success");
      setMessage("Confirmacion registrada. Tambien puedes continuar por WhatsApp.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo enviar la confirmacion.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bingo-reveal rounded-lg border border-white/12 bg-white p-5 text-[#232328] shadow-[0_28px_80px_-45px_rgba(0,0,0,0.68)] sm:p-7">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Nombre completo *
          <input
            required
            value={form.fullName}
            onChange={(event) => updateField("fullName", event.target.value)}
            className="h-11 rounded-md border border-[#dbe1e1] bg-[#fbfdfd] px-3 outline-none focus:border-[#0eb9c3] focus:ring-2 focus:ring-[#0eb9c3]/20"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Numero de documento
          <input
            value={form.documentNumber}
            onChange={(event) => updateField("documentNumber", event.target.value)}
            className="h-11 rounded-md border border-[#dbe1e1] bg-[#fbfdfd] px-3 outline-none focus:border-[#0eb9c3] focus:ring-2 focus:ring-[#0eb9c3]/20"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Telefono *
          <input
            required
            inputMode="tel"
            value={form.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            className="h-11 rounded-md border border-[#dbe1e1] bg-[#fbfdfd] px-3 outline-none focus:border-[#0eb9c3] focus:ring-2 focus:ring-[#0eb9c3]/20"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Correo
          <input
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            className="h-11 rounded-md border border-[#dbe1e1] bg-[#fbfdfd] px-3 outline-none focus:border-[#0eb9c3] focus:ring-2 focus:ring-[#0eb9c3]/20"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Grado o curso *
          <input
            required
            value={form.gradeCourse}
            onChange={(event) => updateField("gradeCourse", event.target.value)}
            className="h-11 rounded-md border border-[#dbe1e1] bg-[#fbfdfd] px-3 outline-none focus:border-[#0eb9c3] focus:ring-2 focus:ring-[#0eb9c3]/20"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Nombre del estudiante *
          <input
            required
            value={form.studentName}
            onChange={(event) => updateField("studentName", event.target.value)}
            className="h-11 rounded-md border border-[#dbe1e1] bg-[#fbfdfd] px-3 outline-none focus:border-[#0eb9c3] focus:ring-2 focus:ring-[#0eb9c3]/20"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Cantidad de asistentes *
          <input
            required
            min={1}
            max={30}
            type="number"
            value={form.attendees}
            onChange={(event) => updateField("attendees", event.target.value)}
            className="h-11 rounded-md border border-[#dbe1e1] bg-[#fbfdfd] px-3 outline-none focus:border-[#0eb9c3] focus:ring-2 focus:ring-[#0eb9c3]/20"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Cantidad de tablas *
          <input
            required
            min={1}
            max={99}
            type="number"
            value={form.tables}
            onChange={(event) => updateField("tables", event.target.value)}
            className="h-11 rounded-md border border-[#dbe1e1] bg-[#fbfdfd] px-3 outline-none focus:border-[#0eb9c3] focus:ring-2 focus:ring-[#0eb9c3]/20"
          />
        </label>
      </div>

      <label className="mt-5 grid gap-2 text-sm font-semibold">
        Observaciones
        <textarea
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          rows={4}
          className="rounded-md border border-[#dbe1e1] bg-[#fbfdfd] px-3 py-2 outline-none focus:border-[#0eb9c3] focus:ring-2 focus:ring-[#0eb9c3]/20"
        />
      </label>

      <label className="mt-6 flex items-start gap-3 rounded-md border border-[#e8eeee] bg-[#f6fbfb] p-4 text-sm leading-6">
        <input
          required
          type="checkbox"
          checked={form.privacy}
          onChange={(event) => updateField("privacy", event.target.checked)}
          className="mt-1 h-5 w-5 rounded border-slate-300 accent-[#0eb9c3]"
        />
        <span>Autorizo el tratamiento de datos personales para la gestion de mi confirmacion.</span>
      </label>

      {message ? (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
          role="status"
        >
          {status === "success" ? <CheckCircle2 className="mr-2 inline h-4 w-4" /> : null}
          {message}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#232328] px-5 text-sm font-black text-white transition duration-300 hover:-translate-y-0.5 hover:bg-[#34343a] active:translate-y-px disabled:opacity-70"
        >
          {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar confirmacion
        </button>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center justify-center rounded-md border border-[#b23178]/25 px-5 text-sm font-black text-[#b23178] transition duration-300 hover:-translate-y-0.5 hover:bg-[#fff1f7] active:translate-y-px"
        >
          Enviar por WhatsApp
        </a>
      </div>
    </form>
  );
}
