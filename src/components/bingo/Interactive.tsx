"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bingoFaqs } from "@/lib/bingo-data";

const BALLS = ["B-7", "I-21", "N-33", "G-48", "O-63"];

export function BingoInteractive() {
  const [activeFaq, setActiveFaq] = useState(0);
  const [drawIndex, setDrawIndex] = useState(0);

  const currentBall = useMemo(() => BALLS[drawIndex % BALLS.length], [drawIndex]);

  return (
    <section className="bg-slate-950 px-4 py-20 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="rounded-[2rem] border border-white/10 bg-white/10 p-8 shadow-2xl shadow-cyan-950/30 backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">Interactivo</p>
          <h2 className="mt-4 text-3xl font-black sm:text-4xl">Siente la emoción antes del evento</h2>
          <p className="mt-4 text-slate-300">
            Esta sección conserva la experiencia dinámica de la landing del bingo dentro del mismo sitio de Sales Col Gemelli.
          </p>
          <div className="mt-8 flex flex-col items-center rounded-3xl bg-white p-8 text-slate-950">
            <div className="grid h-36 w-36 place-items-center rounded-full bg-gradient-to-br from-amber-300 via-pink-400 to-cyan-400 text-4xl font-black shadow-xl">
              {currentBall}
            </div>
            <Button className="mt-6 rounded-full" onClick={() => setDrawIndex((value) => value + 1)}>
              <Shuffle className="mr-2 h-4 w-4" /> Sacar balota demo
            </Button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white p-6 text-slate-950 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-pink-600">Preguntas frecuentes</p>
          <div className="mt-6 divide-y divide-slate-200">
            {bingoFaqs.map((faq, index) => {
              const isOpen = activeFaq === index;
              return (
                <div key={faq.question} className="py-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 text-left font-bold"
                    onClick={() => setActiveFaq(isOpen ? -1 : index)}
                    aria-expanded={isOpen}
                  >
                    {faq.question}
                    <ChevronDown className={`h-5 w-5 transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && <p className="mt-3 text-sm leading-6 text-slate-600">{faq.answer}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
