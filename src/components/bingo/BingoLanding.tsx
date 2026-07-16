import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import { iconMap, type BingoLandingContent } from "@/lib/bingo-data";
import { siteConfig } from "@/lib/site";
import { BingoRegistrationForm } from "./RegistrationForm";

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.34em] text-[#d77200]">
      {children}
    </p>
  );
}

function EditableIcon({ name, className }: { name: keyof typeof iconMap; className?: string }) {
  const Icon = iconMap[name] ?? iconMap.Gift;

  return <Icon className={className} />;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function shouldShowPendingNote(value: string, note?: string) {
  if (!note?.trim()) return false;
  const normalizedValue = normalizeText(value.trim());

  return (
    normalizedValue.length === 0 ||
    normalizedValue.includes("por confirmar") ||
    normalizedValue.includes("pendiente") ||
    normalizedValue.includes("sin definir")
  );
}

function SectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 className={`mt-4 max-w-3xl text-4xl font-semibold leading-[0.98] tracking-tight text-[#070a2c] sm:text-5xl ${className}`}>
      {children}
    </h2>
  );
}

export function BingoLanding({ content, tablesSold }: { content: BingoLandingContent; tablesSold: number }) {
  const whatsappUrl = `https://wa.me/${siteConfig.bingoWhatsAppNumber}?text=${encodeURIComponent(content.whatsappMessage)}`;
  const eventSummary = [
    { icon: iconMap.CalendarDays, label: "Fecha", value: content.event.date },
    { icon: iconMap.CalendarDays, label: "Hora", value: content.event.time },
    { icon: iconMap.MapPin, label: "Lugar", value: content.event.place },
    { icon: iconMap.Ticket, label: "Tabla", value: content.event.tablePrice },
    { icon: iconMap.UsersRound, label: "Ingreso", value: content.event.entrance },
    { icon: iconMap.Trophy, label: "Premio mayor", value: content.event.mainPrize },
  ];
  const essentialInfo = [
    { label: "Fecha", value: content.event.date },
    { label: "Hora", value: content.event.time },
    { label: "Lugar", value: content.event.place },
    { label: "Tabla", value: content.event.tablePrice },
    { label: "Ingreso", value: content.event.entrance },
    { label: "Premio mayor", value: content.event.mainPrize },
    { label: "Forma de pago", value: content.event.payment },
    { label: "Juegos", value: content.event.games },
  ];

  return (
    <main className="min-h-screen bg-white text-[#070a2c]">
      <section className="relative min-h-[100dvh] overflow-hidden bg-[#11142d] text-white">
        <Image
          src="/images/bingo/bingo-card.svg"
          alt="Ambiente del Bingo Gemellista"
          fill
          priority
          className="object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(17,20,45,0.97)_0%,rgba(17,20,45,0.88)_32%,rgba(17,20,45,0.48)_70%,rgba(17,20,45,0.40)_100%)]" />
        <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-5 py-7 sm:px-8 lg:px-10">
          <nav className="flex items-center justify-between">
            <Link href="/" className="text-xs font-bold uppercase tracking-[0.32em] text-white/90">
              {content.hero.navLabel}
            </Link>
            <a
              href="#confirmacion"
              className="rounded-md border border-white/25 px-4 py-3 text-sm font-bold text-white/95 transition hover:bg-white/10 active:translate-y-px"
            >
              {content.hero.secondaryCta}
            </a>
          </nav>

          <div className="grid flex-1 gap-10 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:pb-16">
            <div className="max-w-3xl self-end">
              <span className="inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
                {content.hero.badge}
              </span>
              <h1 className="mt-8 max-w-4xl text-5xl font-semibold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
                {content.hero.title}
              </h1>
              <p className="mt-7 max-w-2xl text-xl leading-8 text-white/92">
                {content.hero.description}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#confirmacion"
                  className="inline-flex h-12 items-center justify-center rounded-md bg-[#ffc83d] px-6 text-sm font-bold text-[#070a2c] transition hover:bg-[#ffd35c] active:translate-y-px"
                >
                  {content.hero.primaryCta}
                </a>
                <a
                  href="#confirmacion"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-white/30 px-6 text-sm font-bold text-white transition hover:bg-white/10 active:translate-y-px"
                >
                  {content.hero.secondaryCta}
                </a>
              </div>
            </div>

            <aside className="self-end rounded-lg border border-white/15 bg-white/10 p-6 shadow-2xl shadow-black/25 backdrop-blur-md">
              <div className="divide-y divide-white/15">
                {eventSummary.map((item) => (
                  <div key={item.label} className="grid grid-cols-[auto_1fr] gap-4 py-4 first:pt-0 last:pb-0">
                    <item.icon className="mt-1 h-5 w-5 text-[#ffc83d]" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/55">
                        {item.label}
                      </p>
                      <p className="mt-2 font-bold text-white">{item.value}</p>
                      {shouldShowPendingNote(item.value, content.event.pendingNote) ? (
                        <p className="mt-1 text-sm text-white/60">{content.event.pendingNote}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-5 right-5 z-30 inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#19a84f] px-5 text-sm font-bold text-white shadow-lg shadow-emerald-900/25 transition hover:bg-[#148d42] active:translate-y-px"
      >
        <MessageCircle className="h-5 w-5" />
        WhatsApp
      </a>

      <section id="informacion" className="bg-[#f5f6fa] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionLabel>{content.information.label}</SectionLabel>
          <SectionTitle>{content.information.title}</SectionTitle>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#3f4d68]">
            {content.information.description}
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {essentialInfo.map((item) => (
              <article key={item.label} className="rounded-md border border-slate-200 bg-white p-6">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#486283]">{item.label}</p>
                <h3 className="mt-5 text-xl font-semibold text-[#070a2c]">{item.value}</h3>
                {shouldShowPendingNote(item.value, content.information.pendingText) ? (
                  <p className="mt-4 text-sm text-[#53617d]">{content.information.pendingText}</p>
                ) : null}
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className="rounded-md border border-[#ffd34f] bg-[#fff9e5] px-5 py-4 font-semibold">
              {content.information.paymentAlert}
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-[#070a2c]">
              Preventa: {new Intl.NumberFormat("es-CO").format(tablesSold)} tablas
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionLabel>Por que asistir</SectionLabel>
          <SectionTitle>Una actividad sencilla, familiar y con proposito</SectionTitle>
          <div className="mt-12 grid gap-4 lg:grid-cols-[1.08fr_0.92fr_0.92fr]">
            {content.reasons.map((reason, index) => (
              <article
                key={reason.title}
                className={`rounded-md border border-slate-200 bg-white p-8 ${
                  index === 0 ? "lg:row-span-2" : ""
                }`}
              >
                <EditableIcon name={reason.icon as keyof typeof iconMap} className="h-7 w-7 text-[#ff9c00]" />
                <h3 className="mt-8 text-xl font-semibold">{reason.title}</h3>
                <p className="mt-5 max-w-sm text-base leading-7 text-[#4a5874]">{reason.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionLabel>{content.participation.label}</SectionLabel>
          <SectionTitle>{content.participation.title}</SectionTitle>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {content.participation.steps.map((step, index) => (
              <article key={step} className="rounded-md border border-slate-200 bg-[#f7f8fb] p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#11142d] text-sm font-bold text-white">
                  {index + 1}
                </span>
                <p className="mt-9 text-base leading-7 text-[#33415f]">{step}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionLabel>{content.food.label}</SectionLabel>
          <SectionTitle>{content.food.title}</SectionTitle>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#40506d]">
            {content.food.description}
          </p>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {content.food.options.map((option) => (
              <article key={option} className="flex items-center gap-4 rounded-md border border-slate-200 bg-[#f7f8fb] p-5 text-lg font-medium">
                <EditableIcon name="Utensils" className="h-5 w-5 text-[#ff9c00]" />
                {option}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionLabel>{content.sponsors.label}</SectionLabel>
          <SectionTitle>{content.sponsors.title}</SectionTitle>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {content.sponsors.plans.map((plan) => (
              <article
                key={plan.title}
                className={`rounded-md border p-6 ${
                  plan.recommended
                    ? "border-[#ffb323] bg-[#fff9e9]"
                    : "border-slate-200 bg-[#f7f8fb]"
                }`}
              >
                {plan.recommended ? (
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d77200]">{content.sponsors.recommendedLabel}</p>
                ) : null}
                <h3 className="mt-4 text-3xl font-semibold">{plan.title}</h3>
                <p className="mt-5 text-lg font-semibold">{plan.price}</p>
                <ul className="mt-8 space-y-4 text-sm text-[#52617d]">
                  {plan.benefits.map((benefit) => (
                    <li key={benefit} className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#ff9c00]" />
                      {benefit}
                    </li>
                  ))}
                </ul>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-md bg-[#11142d] text-sm font-bold text-white transition hover:bg-[#20254a] active:translate-y-px"
                >
                  Contactar
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="confirmacion" className="bg-[#171931] px-5 py-20 text-white sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
          <div>
            <SectionLabel>{content.confirmation.label}</SectionLabel>
            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-[0.98] tracking-tight sm:text-5xl">
              {content.confirmation.title}
            </h2>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/75">
              {content.confirmation.description}
            </p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10 active:translate-y-px"
            >
              <MessageCircle className="h-4 w-4" />
              {content.confirmation.whatsappCta}
            </a>
          </div>
          <BingoRegistrationForm />
        </div>
      </section>

      <footer className="bg-[#11142d] px-5 py-10 text-white sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
          <p>{content.footer.text}</p>
          <Link href="/" className="font-semibold text-white hover:text-[#ffc83d]">
            {content.footer.backLink}
          </Link>
        </div>
      </footer>
    </main>
  );
}
