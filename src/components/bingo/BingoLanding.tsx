import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { iconMap, type BingoFoodProduct, type BingoLandingContent } from "@/lib/bingo-data";
import { siteConfig } from "@/lib/site";
import { BingoRegistrationForm } from "./RegistrationForm";

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-black uppercase tracking-[0.28em] text-[#b23178]">
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
    <h2 className={`mt-4 max-w-3xl text-4xl font-black leading-[0.95] tracking-tight text-[#232328] sm:text-5xl ${className}`}>
      {children}
    </h2>
  );
}

function SectionIntro({
  label,
  title,
  description,
  className = "",
}: {
  label: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <SectionLabel>{label}</SectionLabel>
      <SectionTitle>{title}</SectionTitle>
      {description ? (
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#4b4b52] sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function SectionBand({
  id,
  children,
  variant = "light",
}: {
  id?: string;
  children: ReactNode;
  variant?: "light" | "soft" | "dark";
}) {
  const styles = {
    light: "bg-[#fffdf7]",
    soft: "bg-[#f6fbfb]",
    dark: "bg-[#232328] text-white",
  };

  return (
    <section id={id} className={`${styles[variant]} px-5 py-16 sm:px-8 lg:px-10 lg:py-24`}>
      <div className="mx-auto max-w-7xl">{children}</div>
    </section>
  );
}

function MotionItem({
  children,
  index = 0,
  className = "",
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <div
      className={`bingo-reveal ${className}`}
      style={{ animationDelay: `${index * 90}ms` }}
    >
      {children}
    </div>
  );
}

export function BingoLanding({
  content,
  tablesSold,
  foodProducts,
}: {
  content: BingoLandingContent;
  tablesSold: number;
  foodProducts: BingoFoodProduct[];
}) {
  const whatsappUrl = `https://wa.me/${siteConfig.bingoWhatsAppNumber}?text=${encodeURIComponent(content.whatsappMessage)}`;
  const tablesSoldLabel = new Intl.NumberFormat("es-CO").format(tablesSold);
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
  const marqueeItems = [
    content.information.label,
    content.participation.label,
    content.food.label,
    content.sponsors.label,
    content.confirmation.label,
  ];
  const featuredFoodProduct = foodProducts[0];
  const secondaryFoodProducts = foodProducts.slice(1);

  return (
    <main className="bingo-landing min-h-screen bg-[#fffdf7] text-[#232328]">
      <section className="relative min-h-[100dvh] overflow-hidden bg-[#232328] text-white">
        <Image
          src={content.hero.backgroundImageUrl || "/images/bingo/bingo-card.svg"}
          alt="Ambiente del Bingo Gemellista"
          fill
          priority
          unoptimized={content.hero.backgroundImageUrl.startsWith("data:")}
          className="object-cover opacity-[0.42]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(35,35,40,0.97)_0%,rgba(35,35,40,0.91)_42%,rgba(35,35,40,0.48)_100%)]" />
        <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
          <nav className="bingo-reveal flex items-center justify-between gap-4">
            <Link href="/" className="text-xs font-black uppercase tracking-[0.28em] text-white/90 transition hover:text-[#ecc643]">
              {content.hero.navLabel}
            </Link>
            <a
              href="#confirmacion"
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 bg-white/10 px-4 text-sm font-black text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:bg-white/16 active:translate-y-px"
            >
              {content.hero.secondaryCta}
            </a>
          </nav>

          <div className="grid flex-1 gap-10 py-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-end lg:py-16">
            <div className="self-end">
              <MotionItem>
                <span className="inline-flex items-center gap-2 rounded-md border border-white/18 bg-white/10 px-4 py-2 text-sm font-bold text-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-md">
                  <Sparkles className="h-4 w-4 text-[#ecc643]" />
                  {content.hero.badge}
                </span>
              </MotionItem>
              <MotionItem index={1}>
                <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.92] tracking-tight sm:text-6xl lg:text-7xl">
                  {content.hero.title}
                </h1>
              </MotionItem>
              <MotionItem index={2}>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-white/84 sm:text-xl">
                  {content.hero.description}
                </p>
              </MotionItem>
              <MotionItem index={3}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="#confirmacion"
                    className="bingo-primary-action inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#ecc643] px-6 text-sm font-black text-[#232328] transition duration-300 hover:-translate-y-0.5 hover:bg-[#f2d263] active:translate-y-px"
                  >
                    {content.hero.primaryCta}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href="#informacion"
                    className="inline-flex h-12 items-center justify-center rounded-md border border-white/24 bg-white/[0.08] px-6 text-sm font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:bg-white/[0.14] active:translate-y-px"
                  >
                    Ver datos del evento
                  </a>
                </div>
              </MotionItem>
            </div>

            <MotionItem index={4} className="self-end">
              <aside className="bingo-ticket-panel overflow-hidden rounded-lg border border-white/16 bg-white/[0.13] shadow-2xl shadow-black/30 backdrop-blur-xl">
                <div className="grid border-b border-white/14 bg-white/[0.08] px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-white/58">Datos clave</p>
                    <h2 className="mt-2 text-2xl font-black text-white">Todo para llegar listo</h2>
                  </div>
                  <div className="mt-4 rounded-md bg-[#0eb9c3] px-4 py-3 text-sm font-black text-[#08272a] sm:mt-0">
                    Preventa: {tablesSoldLabel}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2">
                  {eventSummary.map((item, index) => (
                    <article
                      key={item.label}
                      className={`group border-b border-white/12 p-5 transition duration-300 hover:bg-white/[0.08] sm:even:border-l ${
                        index >= eventSummary.length - 2 ? "sm:border-b-0" : ""
                      }`}
                    >
                      <item.icon className="h-5 w-5 text-[#ecc643] transition duration-300 group-hover:-translate-y-0.5" />
                      <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-white/50">
                        {item.label}
                      </p>
                      <p className="mt-2 text-lg font-black text-white">{item.value}</p>
                      {shouldShowPendingNote(item.value, content.event.pendingNote) ? (
                        <p className="mt-2 text-sm leading-6 text-white/56">{content.event.pendingNote}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </aside>
            </MotionItem>
          </div>

          <div className="bingo-marquee mb-2 overflow-hidden border-y border-white/16 py-3 text-xs font-black uppercase tracking-[0.32em] text-white/68">
            <div className="bingo-marquee-track flex min-w-max gap-8">
              {[...marqueeItems, ...marqueeItems].map((item, index) => (
                <span key={`${item}-${index}`} className="flex items-center gap-8">
                  {item}
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ecc643]" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-24 right-5 z-30 inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#128c4a] px-5 text-sm font-black text-white shadow-[0_18px_35px_-18px_rgba(18,140,74,0.95)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#0f7d42] active:translate-y-px"
      >
        <MessageCircle className="h-5 w-5" />
        WhatsApp
      </a>

      <SectionBand id="informacion" variant="soft">
        <SectionIntro
          label={content.information.label}
          title={content.information.title}
          description={content.information.description}
        />

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {essentialInfo.map((item, index) => (
            <MotionItem key={item.label} index={index}>
              <article className="h-full rounded-md border border-[#dce9e9] bg-white p-5 shadow-[0_14px_35px_-26px_rgba(35,35,40,0.42)] transition duration-300 hover:-translate-y-1 hover:border-[#0eb9c3]/55">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#126d74]">{item.label}</p>
                <h3 className="mt-4 text-xl font-black text-[#232328]">{item.value}</h3>
                {shouldShowPendingNote(item.value, content.information.pendingText) ? (
                  <p className="mt-3 text-sm leading-6 text-[#5f686a]">{content.information.pendingText}</p>
                ) : null}
              </article>
            </MotionItem>
          ))}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-stretch">
          <div className="rounded-md border border-[#ecc643]/65 bg-[#fff8d9] px-5 py-4 text-sm font-bold leading-6 text-[#5d4b10] shadow-[0_14px_35px_-28px_rgba(236,198,67,0.95)] sm:text-base">
            {content.information.paymentAlert}
          </div>
          <div className="rounded-md border border-[#0eb9c3]/35 bg-white px-5 py-4 text-sm font-black text-[#232328]">
            Preventa registrada: {tablesSoldLabel} tablas
          </div>
        </div>
      </SectionBand>

      <SectionBand>
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <SectionIntro
            label="Por que asistir"
            title="Una noche clara para compartir en familia"
            description="Ven a vivir una tarde familiar llena de premios, alegria y union gemellista. Confirma tu asistencia hoy y asegura tu lugar en una celebracion pensada para compartir, apoyar y disfrutar juntos."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {content.reasons.map((reason, index) => (
              <MotionItem key={reason.title} index={index}>
                <article
                  className={`group h-full rounded-md border border-[#ece5dd] bg-white p-6 shadow-[0_18px_42px_-30px_rgba(35,35,40,0.45)] transition duration-300 hover:-translate-y-1 hover:border-[#d2528d]/45 ${
                    index === 0 ? "sm:min-h-56" : ""
                  }`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#fff1f7] text-[#b23178] transition duration-300 group-hover:-translate-y-0.5">
                    <EditableIcon name={reason.icon as keyof typeof iconMap} className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-2xl font-black text-[#232328]">{reason.title}</h3>
                  <p className="mt-4 max-w-sm text-base leading-7 text-[#4b4b52]">{reason.description}</p>
                </article>
              </MotionItem>
            ))}
          </div>
        </div>
      </SectionBand>

      <SectionBand variant="soft">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <SectionIntro
            label={content.participation.label}
            title={content.participation.title}
            description="Reserva, confirma y ven preparado para disfrutar una noche familiar llena de premios, encuentro y alegria gemellista."
          />
          <div className="relative">
            <div className="absolute left-4 top-5 hidden h-[calc(100%-2.5rem)] w-px bg-[#0eb9c3]/35 sm:block" />
            <div className="grid gap-4">
              {content.participation.steps.map((step, index) => (
                <MotionItem key={step} index={index}>
                  <article className="relative grid gap-4 rounded-md border border-[#dce9e9] bg-white p-5 shadow-[0_16px_38px_-30px_rgba(35,35,40,0.45)] transition duration-300 hover:-translate-y-1 hover:border-[#0eb9c3]/55 sm:grid-cols-[3rem_1fr] sm:items-center">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-[#0eb9c3] text-sm font-black text-[#062f34] ring-4 ring-[#eafafa]">
                      {index + 1}
                    </span>
                    <p className="text-base font-semibold leading-7 text-[#33415f]">{step}</p>
                  </article>
                </MotionItem>
              ))}
            </div>
          </div>
        </div>
      </SectionBand>

      <SectionBand>
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div className="lg:sticky lg:top-10">
            <SectionIntro
              label={content.food.label}
              title={content.food.title}
              description={content.food.description}
            />
            <div className="mt-8 rounded-md border border-[#ecc643]/45 bg-[#fff8d9] p-5 text-sm font-bold leading-6 text-[#5d4b10] shadow-[0_18px_42px_-34px_rgba(236,198,67,0.9)]">
              Compra tus antojos durante el evento y acompaña cada juego con algo rico para compartir.
            </div>
          </div>

          <div className="space-y-4">
            {foodProducts.length > 0 ? (
              <>
                {featuredFoodProduct ? (
                  <MotionItem>
                    <article className="group overflow-hidden rounded-md border border-[#ece5dd] bg-white shadow-[0_28px_70px_-48px_rgba(35,35,40,0.55)] transition duration-300 hover:-translate-y-1 hover:border-[#ecc643]/80">
                      <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
                        <div className="relative aspect-[4/3] bg-[#fff8d9] md:aspect-auto md:min-h-[18rem]">
                          {featuredFoodProduct.imageUrl ? (
                            <Image
                              src={featuredFoodProduct.imageUrl}
                              alt={featuredFoodProduct.imageHint || featuredFoodProduct.name}
                              fill
                              sizes="(min-width: 1024px) 420px, 100vw"
                              className="object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#8a6f12]">
                              <EditableIcon name="Utensils" className="h-16 w-16" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col justify-center p-7 sm:p-8">
                          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b23178]">
                            Recomendado para compartir
                          </p>
                          <h3 className="mt-4 text-4xl font-black leading-none tracking-tight text-[#232328]">
                            {featuredFoodProduct.name}
                          </h3>
                          <p className="mt-5 max-w-sm text-base font-semibold leading-7 text-[#4b4b52]">
                            Una opcion lista para disfrutar mientras avanza la noche del bingo.
                          </p>
                        </div>
                      </div>
                    </article>
                  </MotionItem>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {secondaryFoodProducts.map((product, index) => (
                    <MotionItem key={product.id} index={index + 1}>
                      <article className="group overflow-hidden rounded-md border border-[#ece5dd] bg-white shadow-[0_16px_38px_-30px_rgba(35,35,40,0.45)] transition duration-300 hover:-translate-y-1 hover:border-[#ecc643]/70">
                        <div className="relative aspect-[5/4] bg-[#fff8d9]">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt={product.imageHint || product.name}
                              fill
                              sizes="(min-width: 1280px) 210px, (min-width: 640px) 45vw, 100vw"
                              className="object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#8a6f12]">
                              <EditableIcon name="Utensils" className="h-10 w-10" />
                            </div>
                          )}
                        </div>
                        <div className="flex min-h-20 items-center p-4">
                          <h3 className="text-lg font-black leading-tight text-[#232328]">
                            {product.name}
                          </h3>
                        </div>
                      </article>
                    </MotionItem>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {content.food.options.map((option, index) => (
                  <MotionItem key={option} index={index}>
                    <article className="group flex min-h-28 items-center gap-4 rounded-md border border-[#ece5dd] bg-white p-5 text-lg font-black text-[#232328] shadow-[0_15px_34px_-28px_rgba(35,35,40,0.45)] transition duration-300 hover:-translate-y-1 hover:border-[#ecc643]/70">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#fff8d9] text-[#8a6f12] transition duration-300 group-hover:-rotate-2">
                        <EditableIcon name="Utensils" className="h-6 w-6" />
                      </span>
                      {option}
                    </article>
                  </MotionItem>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionBand>

      <SectionBand variant="soft">
        <SectionIntro
          label={content.sponsors.label}
          title={content.sponsors.title}
          description="Haz que tu marca o tu aporte sea parte de una noche que une a las familias y deja huella en el colegio."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-[1.15fr_0.9fr_1fr]">
          {content.sponsors.plans.map((plan, index) => (
            <MotionItem key={plan.title} index={index}>
              <article
                className={`group h-full rounded-md border p-6 shadow-[0_18px_42px_-30px_rgba(35,35,40,0.48)] transition duration-300 hover:-translate-y-1 ${
                  plan.recommended
                    ? "border-[#d2528d]/45 bg-[#fff1f7]"
                    : "border-[#dce9e9] bg-white"
                }`}
              >
                {plan.recommended ? (
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b23178]">{content.sponsors.recommendedLabel}</p>
                ) : null}
                <h3 className="mt-4 text-3xl font-black text-[#232328]">{plan.title}</h3>
                <p className="mt-4 text-lg font-black text-[#126d74]">{plan.price}</p>
                <ul className="mt-7 space-y-4 text-sm leading-6 text-[#4b4b52]">
                  {plan.benefits.map((benefit) => (
                    <li key={benefit} className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b23178]" />
                      {benefit}
                    </li>
                  ))}
                </ul>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#232328] text-sm font-black text-white transition duration-300 hover:-translate-y-0.5 hover:bg-[#34343a] active:translate-y-px"
                >
                  {content.sponsors.cta}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </article>
            </MotionItem>
          ))}
        </div>
      </SectionBand>

      <section id="confirmacion" className="relative overflow-hidden bg-[#232328] px-5 py-16 text-white sm:px-8 lg:px-10 lg:py-24">
        <div className="absolute inset-0 bingo-stage-lines opacity-35" />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div>
            <SectionLabel>{content.confirmation.label}</SectionLabel>
            <h2 className="mt-4 max-w-xl text-4xl font-black leading-[0.95] tracking-tight sm:text-5xl">
              {content.confirmation.title}
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/72">
              {content.confirmation.description}
            </p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-5 text-sm font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:bg-white/16 active:translate-y-px"
            >
              <MessageCircle className="h-4 w-4" />
              {content.confirmation.whatsappCta}
            </a>
          </div>
          <BingoRegistrationForm />
        </div>
      </section>

      <footer className="bg-[#19191e] px-5 py-10 text-white sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-white/68 sm:flex-row sm:items-center sm:justify-between">
          <p>{content.footer.text}</p>
          <Link href="/" className="font-bold text-white transition hover:text-[#ecc643]">
            {content.footer.backLink}
          </Link>
        </div>
      </footer>
    </main>
  );
}
