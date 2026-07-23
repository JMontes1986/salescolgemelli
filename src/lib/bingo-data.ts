import {
  CalendarDays,
  Gift,
  HandHeart,
  MapPin,
  Music2,
  Ticket,
  Trophy,
  Utensils,
  UsersRound,
} from "lucide-react";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

export type BingoLandingContent = typeof defaultBingoContent;

export type BingoFoodProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  imageHint: string;
  category: string;
  stock: number;
};

type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

const BINGO_LANDING_BLOCKED_PRODUCT_TERMS = [
  "aguardiente",
  "alcohol",
  "cerveza",
  "licor",
  "ron",
  "whisky",
  "vino",
];

export const defaultBingoContent = {
  whatsappMessage: "Hola, quiero informacion para reservar tablas del Bingo Gemellista 2026.",
  hero: {
    navLabel: "Colegio Agustin Gemelli",
    backgroundImageUrl: "/images/bingo/bingo-card.svg",
    badge: "Evento familiar",
    title: "Gran Bingo y Fiesta Familiar Gemellista 2026",
    eyebrow: "Colegio Agustin Gemelli",
    description:
      "La informacion importante del Bingo Gemellista en un solo lugar: fecha, lugar, participacion, comida, publicidad y confirmacion.",
    primaryCta: "Reservar tablas",
    secondaryCta: "Confirmar asistencia",
    awardsCta: "Conocer los premios",
  },
  event: {
    date: "01 de Agosto de 2026",
    time: "Hora por confirmar",
    place: "Instalaciones del colegio",
    tablePrice: "Valor por confirmar",
    entrance: "Valor por confirmar",
    mainPrize: "Premio mayor por confirmar",
    payment: "Pago en efectivo en Tesoreria",
    games: "Cantidad por confirmar",
    pendingNote: "Dato pendiente de confirmacion oficial.",
  },
  intro: {
    title: "Una noche para compartir, disfrutar y ayudar",
    paragraphs: [
      "El Bingo Gemellista reune a familias, estudiantes, egresados, colaboradores, empresas aliadas y amigos del colegio alrededor de una actividad alegre, organizada y solidaria.",
      "Cada participacion aporta al fortalecimiento de los proyectos institucionales y nos permite seguir creando mejores experiencias para los estudiantes.",
    ],
  },
  stats: [
    { value: "Por confirmar", label: "Familias confirmadas" },
    { value: "Por confirmar", label: "Tablas reservadas" },
    { value: "Por confirmar", label: "Patrocinadores" },
    { value: "Por confirmar", label: "Premios confirmados" },
  ],
  information: {
    label: "Informacion esencial",
    title: "Datos del evento",
    description: "Encuentra aqui todo lo que necesitas para animarte, organizar tu llegada y disfrutar el Bingo Gemellista sin complicaciones.",
    pendingText: "Pendiente de confirmacion.",
    paymentAlert: "Las tablas se adquieren con pago en efectivo en la Tesoreria del colegio.",
  },
  reasons: [
    { icon: "UsersRound", title: "Plan familiar", description: "Una noche sencilla para compartir con la comunidad Gemellista." },
    { icon: "Trophy", title: "Premios", description: "Juegos y oportunidades para participar durante el evento." },
    { icon: "Utensils", title: "Comida", description: "Zona gastronomica disponible para acompanar la noche." },
    { icon: "HandHeart", title: "Apoyo al colegio", description: "Tu participacion ayuda a fortalecer los proyectos institucionales." },
  ],
  prizes: {
    label: "Premios",
    title: "Premios preparados para celebrar juntos",
    description: "Cada premio suma emocion a la noche: participa, acompana a tu familia y vive la alegria de ganar junto a la comunidad.",
    featuredNote: "Contenido de ejemplo. Reemplazar por el premio oficial.",
    cards: [
      { icon: "Trophy", label: "Por confirmar", title: "Premio mayor", description: "Espacio reservado para publicar el premio principal oficial del Bingo Gemellista 2026.", featured: true },
      { icon: "Gift", label: "Ejemplo editable", title: "Premio familiar destacado", description: "Reemplaza este bloque por un premio real donado por familias o aliados." },
      { icon: "Gift", label: "Ejemplo editable", title: "Bono o experiencia", description: "Puede convertirse en bono, tecnologia, viaje, servicio o experiencia confirmada." },
      { icon: "Gift", label: "Ejemplo editable", title: "Sorpresa de patrocinador", description: "Espacio para vincular una marca aliada con un premio especifico." },
    ],
  },
  participation: { label: "Como participar", title: "Participar es facil", steps: ["Reserva o compra tus tablas por los canales oficiales.", "Confirma tus datos y la cantidad de asistentes.", "Recibe las indicaciones finales del colegio.", "Asiste, disfruta y participa en los juegos."] },
  schedule: { label: "Cronograma", title: "Una noche organizada, con momentos para todos", items: [
    { time: "Por confirmar", title: "Apertura de puertas", description: "Ingreso y bienvenida de familias." },
    { time: "Por confirmar", title: "Bienvenida", description: "Saludo institucional y orientaciones generales." },
    { time: "Por confirmar", title: "Inicio del bingo", description: "Primeros juegos de la noche." },
    { time: "Por confirmar", title: "Rifas", description: "Premios especiales y pausas de entretenimiento." },
    { time: "Por confirmar", title: "Presentacion especial", description: "Espacio musical o cultural sujeto a programacion." },
    { time: "Por confirmar", title: "Premio mayor", description: "Juego principal de cierre." },
    { time: "Por confirmar", title: "Cierre", description: "Agradecimientos y salida organizada." },
  ] },
  video: { label: "Video promocional", title: "Una invitacion para sentir la noche antes de llegar", description: "Este bloque esta preparado para YouTube, Vimeo o video institucional. El reproductor solo carga cuando el usuario decide reproducirlo.", status: "Video pendiente de configuracion." },
  gallery: { label: "Galeria", title: "Recuerdos de una comunidad que se encuentra", description: "Galeria responsive preparada para fotos reales de ediciones anteriores.", caption: "Placeholder generado. Reemplazar por foto oficial." },
  food: { label: "Zona gastronomica", title: "Comida y bebidas", description: "Antojos pensados para acompanar la noche, compartir en familia y disfrutar el bingo con algo rico en la mesa.", options: ["Perros calientes", "Empanadas", "Hamburguesas", "Pinchos", "Bebidas", "Postres"] },
  donations: { title: "Ayudanos a hacer esta noche aun mas especial", description: "Las familias, empresas y aliados que deseen donar un premio pueden vincularse al Bingo Gemellista y aportar al exito de esta actividad.", cta: "Quiero donar un premio" },
  sponsors: { label: "Publicidad para empresas", title: "Espacios para marcas aliadas", recommendedLabel: "Recomendado", cta: "Contactar", plans: [
    { title: "Pendon fisico", price: "Precio por confirmar", benefits: ["Presencia visible durante el evento", "Mencion como aliado", "Ubicacion sujeta a disponibilidad"] },
    { title: "Publicidad digital", price: "Precio por confirmar", benefits: ["Publicacion en piezas digitales", "Espacio para logo o mensaje", "Alcance en comunidad educativa"] },
    { title: "Plan combinado", price: "Precio por confirmar", recommended: true, benefits: ["Pendon fisico y presencia digital", "Mayor exposicion", "Prioridad en comunicacion del evento"] },
  ] },
  confirmation: { label: "Confirmacion", title: "Confirma tu asistencia", description: "Diligencia el formulario o escribe por WhatsApp para que la organizacion registre tu participacion.", whatsappCta: "Resolver por WhatsApp" },
  design: {
    textStyles: {} as Record<string, {
      fontSize?: number;
      color?: string;
      bold?: boolean;
      underline?: boolean;
      shadow?: boolean;
    }>,
  },
  footer: { text: "Bingo Gemellista 2026 - Colegio Agustin Gemelli", backLink: "Volver a Sales Col Gemelli" },
};

function mergeContent<T>(base: T, override?: DeepPartial<T>): T {
  if (!override) return base;
  if (Array.isArray(base)) return (Array.isArray(override) ? override : base) as T;
  if (typeof base !== "object" || base === null) return (override ?? base) as T;
  return Object.entries(base).reduce((merged, [key, value]) => ({
    ...merged,
    [key]: mergeContent(value, (override as Record<string, unknown>)[key] as DeepPartial<typeof value>),
  }), {} as T);
}

function replaceStaleLandingText(content: BingoLandingContent): BingoLandingContent {
  const nextContent = mergeContent(defaultBingoContent, content);
  const replacements = new Map([
    [
      "Los datos finales se actualizan desde el panel administrativo para evitar versiones cruzadas o información desactualizada.",
      "Encuentra aqui todo lo que necesitas para animarte, organizar tu llegada y disfrutar el Bingo Gemellista sin complicaciones.",
    ],
    [
      "Los datos finales se actualizan desde el panel administrativo para evitar versiones cruzadas o informacion desactualizada.",
      "Encuentra aqui todo lo que necesitas para animarte, organizar tu llegada y disfrutar el Bingo Gemellista sin complicaciones.",
    ],
    [
      "Consulta aqui los datos clave. Si algun punto sigue pendiente, se actualizara cuando exista confirmacion oficial.",
      "Encuentra aqui todo lo que necesitas para animarte, organizar tu llegada y disfrutar el Bingo Gemellista sin complicaciones.",
    ],
    [
      "Cuatro pasos claros para llegar tranquilo.",
      "Reserva, confirma y ven preparado para disfrutar una noche familiar llena de premios, encuentro y alegria gemellista.",
    ],
    [
      "Cuatro pasos simples para que el padre de familia confirme y llegue sin dudas.",
      "Reserva, confirma y ven preparado para disfrutar una noche familiar llena de premios, encuentro y alegria gemellista.",
    ],
    [
      "Empresas y familias aliadas pueden hacerse visibles ante la comunidad durante el evento.",
      "Haz que tu marca o tu aporte sea parte de una noche que une a las familias y deja huella en el colegio.",
    ],
  ]);

  const replace = (value: string) => replacements.get(value.trim()) ?? value;

  return {
    ...nextContent,
    information: {
      ...nextContent.information,
      description: replace(nextContent.information.description),
    },
    participation: {
      ...nextContent.participation,
      title: replace(nextContent.participation.title),
    },
    food: {
      ...nextContent.food,
      description: replace(nextContent.food.description),
    },
    sponsors: {
      ...nextContent.sponsors,
      title: replace(nextContent.sponsors.title),
    },
  };
}

export async function getBingoLandingContent() {
  try {
    const { supabaseUrl } = getSupabaseEnv();
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/bingo_landing_content?id=eq.default&select=content`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      cache: "no-store",
    });
    if (!response.ok) return defaultBingoContent;
    const rows = (await response.json()) as { content?: DeepPartial<BingoLandingContent> }[];
    return replaceStaleLandingText(mergeContent(defaultBingoContent, rows[0]?.content));
  } catch {
    return defaultBingoContent;
  }
}

function countCartUnits(items: unknown, onlyTables: boolean) {
  if (!Array.isArray(items)) return 0;

  return items.reduce((total, item) => {
    if (!item || typeof item !== "object") return total;

    const record = item as Record<string, unknown>;
    const quantity = Number(record.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return total;

    if (onlyTables) {
      const searchable = `${String(record.name ?? "")} ${String(record.id ?? "")}`;
      const normalized = searchable
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      if (!normalized.includes("tabla") && !normalized.includes("bingo")) {
        return total;
      }
    }

    return total + quantity;
  }, 0);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isAllowedBingoLandingProduct(product: Pick<BingoFoodProduct, "name" | "category">) {
  const searchable = normalizeSearchText(`${product.name} ${product.category}`);

  return !BINGO_LANDING_BLOCKED_PRODUCT_TERMS.some((term) => searchable.includes(term));
}

export async function getBingoPreSaleTablesSold() {
  try {
    const { supabaseUrl } = getSupabaseEnv();
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const params = new URLSearchParams({
      select: "items",
      id: "like.PV%",
      status: "in.(pre-sale,pre-sale-confirmed)",
    });
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/purchases?${params.toString()}`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      cache: "no-store",
    });

    if (!response.ok) return 0;

    const rows = (await response.json()) as { items?: unknown }[];
    const tableUnits = rows.reduce((total, row) => total + countCartUnits(row.items, true), 0);

    return tableUnits > 0
      ? tableUnits
      : rows.reduce((total, row) => total + countCartUnits(row.items, false), 0);
  } catch {
    return 0;
  }
}

export async function getBingoFoodProducts(): Promise<BingoFoodProduct[]> {
  try {
    const { supabaseUrl } = getSupabaseEnv();
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const params = new URLSearchParams({
      select: 'id,name,price,"imageUrl","imageHint",category,stock,availability,position',
      order: "position.asc",
    });
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/products?${params.toString()}`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      cache: "no-store",
    });

    if (!response.ok) return [];

    const rows = (await response.json()) as Array<BingoFoodProduct & { availability?: unknown; position?: number }>;

    return rows
      .filter((product) => Array.isArray(product.availability) && product.availability.includes("pos"))
      .filter((product) => Number(product.stock) > 0)
      .filter((product) => isAllowedBingoLandingProduct({
        name: product.name,
        category: product.category ?? "",
      }))
      .map((product) => ({
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        imageUrl: product.imageUrl ?? "",
        imageHint: product.imageHint ?? "",
        category: product.category ?? "general",
        stock: Number(product.stock) || 0,
      }));
  } catch {
    return [];
  }
}

export const iconMap = { CalendarDays, Gift, HandHeart, MapPin, Music2, Ticket, Trophy, Utensils, UsersRound };
