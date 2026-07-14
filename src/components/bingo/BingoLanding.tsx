import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bingoEventDetails, bingoHighlights, bingoPrizes } from "@/lib/bingo-data";
import { siteConfig } from "@/lib/site";
import { BingoInteractive } from "./Interactive";

export function BingoLanding() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fff8e7] text-slate-950">
      <section className="relative px-4 py-8 sm:px-6 lg:px-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.35),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(251,191,36,.35),transparent_28%),radial-gradient(circle_at_50%_85%,rgba(236,72,153,.25),transparent_35%)]" />
        <nav className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-950">
            <ArrowLeft className="h-4 w-4" /> Sales Col Gemelli
          </Link>
          <a href={siteConfig.bingoUrl} className="text-xs font-bold uppercase tracking-[0.25em] text-pink-600">
            /bingo
          </a>
        </nav>

        <div className="mx-auto grid max-w-6xl gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div>
            <div className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-cyan-700 shadow-sm">
              Landing oficial integrada al deploy principal
            </div>
            <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
              Bingo <span className="text-pink-600">Gemellista</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">
              Una página de bienvenida para convocar a la comunidad del Colegio Gemelli, centralizada ahora en el mismo repositorio y dominio de Sales Col Gemelli.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full bg-slate-950 hover:bg-slate-800">
                <a href="#detalles">Ver detalles <ArrowRight className="ml-2 h-4 w-4" /></a>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-slate-300 bg-white/80">
                <Link href="/">Volver al sistema</Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-cyan-300 via-pink-300 to-amber-300 blur-2xl opacity-60" />
            <Image
              src="/images/bingo/bingo-card.svg"
              alt="Tarjeta promocional del Bingo Gemellista"
              width={1200}
              height={800}
              priority
              className="relative rounded-[2rem] border-8 border-white shadow-2xl"
            />
          </div>
        </div>
      </section>

      <section id="detalles" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {bingoEventDetails.map((detail) => (
            <article key={detail.label} className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-200/70">
              <detail.icon className="h-8 w-8 text-pink-600" />
              <p className="mt-5 text-sm font-bold uppercase tracking-[0.25em] text-slate-500">{detail.label}</p>
              <h2 className="mt-2 text-2xl font-black">{detail.value}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{detail.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-cyan-700">Por qué participar</p>
            <h2 className="mt-3 text-4xl font-black">Una jornada para encontrarnos y apoyar al colegio</h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {bingoHighlights.map((item) => (
              <article key={item.title} className="rounded-3xl border border-white bg-white/80 p-6 shadow-sm">
                <item.icon className="h-8 w-8 text-cyan-600" />
                <h3 className="mt-5 text-xl font-black">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
          {bingoPrizes.map((prize) => (
            <article key={prize.title} className="overflow-hidden rounded-3xl bg-white shadow-lg">
              <div className={`h-3 bg-gradient-to-r ${prize.accent}`} />
              <div className="p-6">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
                <h3 className="mt-5 text-2xl font-black">{prize.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{prize.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <BingoInteractive />
    </main>
  );
}
