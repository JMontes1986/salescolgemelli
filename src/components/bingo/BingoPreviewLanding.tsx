import Image from "next/image";
import Link from "next/link";

const officialGalleryUrl =
  "https://colgemelli.edu.co/es/igaleriaplus/galeria/456/bingo-gemellista-2026/";

const galleryImages = [
  "/images/bingo/gallery/28335.jpg",
  "/images/bingo/gallery/28336.jpg",
  "/images/bingo/gallery/28338.jpg",
  "/images/bingo/gallery/28340.jpg",
  "/images/bingo/gallery/28342.jpg",
  "/images/bingo/gallery/28344.jpg",
] as const;

export function BingoPreviewLanding({ showSelfServiceNotice = false }: { showSelfServiceNotice?: boolean }) {
  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#f5f1e8] font-sans text-[#24231f]">
      <section className="relative min-h-[100dvh] bg-[#24231f] text-[#fffdf7]">
        <div className="mx-auto flex min-h-[100dvh] max-w-[1400px] flex-col px-5 py-5 sm:px-8 lg:px-12">
          <nav className="flex items-center justify-between gap-5 border-b border-white/15 pb-5">
            <Link href="/bingo" className="text-sm font-black uppercase tracking-[0.2em] transition duration-300 hover:text-[#d7b44a] active:translate-y-px">Colegio Gemelli</Link>
            <Link href="/" className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white/80 transition duration-300 hover:border-white/45 hover:text-white active:translate-y-px">Acceso del equipo</Link>
          </nav>
          <div className="grid flex-1 gap-12 py-10 md:py-14 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-20">
            <div className="relative z-[1] max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.32em] text-[#d7b44a]">Encuentro de la familia gemellista</p>
              <h1 className="mt-6 text-5xl font-black leading-[0.92] tracking-[-0.055em] sm:text-6xl lg:text-7xl">Bingo<span className="block text-white/55">Gemellista</span></h1>
              <p className="mt-7 max-w-xl text-base font-medium leading-7 text-white/70 sm:text-lg sm:leading-8">Un espacio para encontrarnos, compartir en familia y vivir la alegr&#237;a de nuestra comunidad educativa.</p>
              {showSelfServiceNotice ? (
                <div className="mt-8 max-w-xl border-l-2 border-[#d7b44a] bg-white/[0.06] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#d7b44a]">Aviso importante</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-white/75">La Autogesti&#243;n est&#225; temporalmente deshabilitada. Cuando el nuevo proceso est&#225; listo, publicaremos aqu&#237; toda la informaci&#243;n para participar.</p>
                </div>
              ) : null}
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a href="#informacion" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#d7b44a] px-6 text-sm font-black text-[#24231f] transition duration-300 hover:-translate-y-0.5 hover:bg-[#e0c268] active:translate-y-px">Conocer m&#225;s</a>
                <a href={officialGalleryUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 px-6 text-sm font-black transition duration-300 hover:-translate-y-0.5 hover:border-white/45 hover:bg-white/[0.06] active:translate-y-px">Ver galer&#237;a oficial 2026</a>
              </div>
            </div>
            <div className="relative mx-auto grid w-full max-w-[620px] grid-cols-[1.16fr_0.84fr] gap-3 lg:mx-0 lg:justify-self-end">
              <figure className="relative mt-12 aspect-[4/5] overflow-hidden rounded-[2rem]">
                <Image src="/images/bingo/gallery/28334.jpg" alt="Encuentro de la comunidad durante el Bingo Gemellista 2026" fill priority sizes="(max-width: 1024px) 55vw, 34vw" className="object-cover transition duration-700 hover:scale-[1.025]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#24231f]/45 via-transparent to-transparent" />
              </figure>
              <div className="grid gap-3">
                <figure className="relative aspect-[3/4] overflow-hidden rounded-[1.5rem]">
                  <Image src="/images/bingo/gallery/28337.jpg" alt="Celebraci&#243;n del Bingo Gemellista 2026" fill priority sizes="(max-width: 1024px) 38vw, 22vw" className="object-cover transition duration-700 hover:scale-[1.025]" />
                </figure>
                <div className="rounded-[1.5rem] border border-white/15 bg-white/[0.07] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-[#d7b44a]">Pr&#243;ximamente</p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-white/70">Fecha, lugar, programaci&#243;n y proceso de participaci&#243;n.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="informacion" className="px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto max-w-[1400px] border-t border-[#24231f]/20 pt-8">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#80691f]">El Bingo en cifras</p>
              <h2 className="mt-5 max-w-xl text-4xl font-black leading-none tracking-[-0.045em] sm:text-5xl">Una noche que reuni&#243; a toda nuestra comunidad.</h2>
              <p className="mt-6 max-w-lg text-base font-semibold leading-7 text-[#656055]">Las ventas, los juegos, los premios y la zona gastron&#243;mica hicieron de nuestro Bingo Gemellista 2026 una jornada para recordar.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <article className="grid min-h-64 gap-8 rounded-[2rem] bg-[#24231f] p-7 text-white shadow-[0_24px_50px_-36px_rgba(36,35,31,0.7)] sm:col-span-2 sm:grid-cols-[0.7fr_1.3fr] sm:items-end sm:p-9">
                <p className="text-7xl font-black leading-none tracking-[-0.07em] text-[#d7b44a] sm:text-8xl">+300</p>
                <div className="border-t border-white/20 pt-5">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d7b44a]">Personas asistentes</p>
                  <p className="mt-3 max-w-md text-lg font-semibold leading-7 text-white/72">Familias, estudiantes, colaboradores y amigos compartieron juntos nuestro Bingo Gemellista.</p>
                </div>
              </article>

              <article className="border-t border-[#24231f]/25 px-1 pt-6">
                <p className="text-5xl font-black tracking-[-0.06em] text-[#24231f]">62</p>
                <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-[#80691f]">Fotograf&#237;as oficiales</p>
                <p className="mt-3 text-sm font-semibold leading-6 text-[#656055]">Momentos que quedaron guardados en el &#225;lbum institucional.</p>
              </article>

              <article className="border-t border-[#24231f]/25 px-1 pt-6 sm:mt-12">
                <p className="text-3xl font-black tracking-[-0.04em] text-[#24231f]">Una gran jornada</p>
                <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-[#80691f]">Ventas, premios y gastronom&#237;a</p>
                <p className="mt-3 text-sm font-semibold leading-6 text-[#656055]">Cada compra y cada encuentro ayudaron a darle vida a la celebraci&#243;n.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#ebe4d6] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#80691f]">Memoria 2026</p>
              <h2 className="mt-5 max-w-2xl text-4xl font-black leading-none tracking-[-0.045em] sm:text-5xl">As&#237; se vive el Bingo Gemellista.</h2>
            </div>
            <a href={officialGalleryUrl} target="_blank" rel="noreferrer" className="w-fit border-b border-[#24231f] pb-1 text-sm font-black transition duration-300 hover:text-[#80691f] active:translate-y-px">Explorar el &#193;lbum completo</a>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4 md:grid-rows-[260px_320px]">
            {galleryImages.map((src, index) => {
              const featureClass = index === 0 ? "col-span-2 row-span-1 md:row-span-2" : index === 3 ? "col-span-2 md:col-span-1" : "";
              return (
                <figure key={src} className={"relative min-h-52 overflow-hidden rounded-[1.5rem] bg-[#d8d0c1] " + featureClass}>
                  <Image src={src} alt={"Bingo Gemellista 2026, fotograf\u00eda " + (index + 1)} fill sizes="(max-width: 767px) 50vw, 25vw" className="object-cover transition duration-700 hover:scale-[1.035]" />
                </figure>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="bg-[#24231f] px-5 py-10 text-white sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-[1400px] gap-8 border-t border-white/15 pt-8 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em]">Colegio Franciscano Agust&#237;n Gemelli</p>
            <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-white/55">La Autogesti&#243;n permanece deshabilitada hasta que publiquemos el nuevo proceso de participaci&#243;n.</p>
          </div>
          <a href="https://colgemelli.edu.co/" target="_blank" rel="noreferrer" className="w-fit text-sm font-black text-[#d7b44a] transition duration-300 hover:text-[#e0c268] active:translate-y-px">Sitio institucional</a>
        </div>
      </footer>
    </main>
  );
}
