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

export const bingoEvent = {
  title: "Gran Bingo y Fiesta Familiar Gemellista 2026",
  eyebrow: "Colegio Agustin Gemelli",
  description:
    "Una noche para compartir en familia, ganar grandes premios y seguir construyendo juntos el futuro de nuestros estudiantes.",
  date: "01 de Agosto de 2026",
  time: "Hora por confirmar",
  place: "Instalaciones del colegio",
  tablePrice: "Valor por confirmar",
  entrance: "Valor por confirmar",
  mainPrize: "Premio mayor por confirmar",
  payment: "Pago en efectivo en Tesoreria",
  games: "Cantidad por confirmar",
};

export const eventSummary = [
  { icon: CalendarDays, label: "Fecha", value: bingoEvent.date },
  { icon: CalendarDays, label: "Hora", value: bingoEvent.time },
  { icon: MapPin, label: "Lugar", value: bingoEvent.place },
  { icon: Ticket, label: "Tabla", value: bingoEvent.tablePrice },
  { icon: UsersRound, label: "Ingreso", value: bingoEvent.entrance },
  { icon: Trophy, label: "Premio mayor", value: bingoEvent.mainPrize },
];

export const bingoStats = [
  { value: "Por confirmar", label: "Familias confirmadas" },
  { value: "Por confirmar", label: "Tablas reservadas" },
  { value: "Por confirmar", label: "Patrocinadores" },
  { value: "Por confirmar", label: "Premios confirmados" },
];

export const essentialInfo = [
  { label: "Fecha", value: bingoEvent.date },
  { label: "Hora", value: bingoEvent.time },
  { label: "Lugar", value: bingoEvent.place },
  { label: "Tabla", value: bingoEvent.tablePrice },
  { label: "Ingreso", value: bingoEvent.entrance },
  { label: "Premio mayor", value: bingoEvent.mainPrize },
  { label: "Forma de pago", value: bingoEvent.payment },
  { label: "Juegos", value: bingoEvent.games },
];

export const reasonsToAttend = [
  {
    icon: UsersRound,
    title: "Ambiente familiar",
    description:
      "Un espacio tranquilo y cercano para compartir con personas de todas las edades.",
  },
  {
    icon: Trophy,
    title: "Grandes premios",
    description:
      "La pagina queda preparada para publicar premios confirmados, donantes y categorias.",
  },
  {
    icon: Ticket,
    title: "Oportunidades para ganar",
    description:
      "Cada juego suma emocion y mantiene viva la participacion de toda la comunidad.",
  },
  {
    icon: Music2,
    title: "Musica y entretenimiento",
    description:
      "Momentos especiales para acompanar la noche sin recargar la experiencia.",
  },
  {
    icon: Utensils,
    title: "Zona gastronomica",
    description:
      "Opciones familiares para disfrutar durante el evento, sujetas a disponibilidad.",
  },
  {
    icon: HandHeart,
    title: "Apoyo al colegio",
    description:
      "Participar tambien es ayudar a que los proyectos institucionales sigan creciendo.",
  },
];

export const prizeCards = [
  {
    icon: Trophy,
    label: "Por confirmar",
    title: "Premio mayor",
    description:
      "Espacio reservado para publicar el premio principal oficial del Bingo Gemellista 2026.",
    featured: true,
  },
  {
    icon: Gift,
    label: "Ejemplo editable",
    title: "Premio familiar destacado",
    description:
      "Reemplaza este bloque por un premio real donado por familias o aliados.",
  },
  {
    icon: Gift,
    label: "Ejemplo editable",
    title: "Bono o experiencia",
    description:
      "Puede convertirse en bono, tecnologia, viaje, servicio o experiencia confirmada.",
  },
  {
    icon: Gift,
    label: "Ejemplo editable",
    title: "Sorpresa de patrocinador",
    description:
      "Espacio para vincular una marca aliada con un premio especifico.",
  },
];

export const participationSteps = [
  "Reserva o compra tus tablas por los canales oficiales del colegio.",
  "Confirma cuantas personas asistiran y cuantas tablas deseas.",
  "Recibe la informacion final del evento y las indicaciones de ingreso.",
  "Llega con tu familia, disfruta la noche y participa en los juegos.",
];

export const scheduleItems = [
  {
    time: "Por confirmar",
    title: "Apertura de puertas",
    description: "Ingreso y bienvenida de familias.",
  },
  {
    time: "Por confirmar",
    title: "Bienvenida",
    description: "Saludo institucional y orientaciones generales.",
  },
  {
    time: "Por confirmar",
    title: "Inicio del bingo",
    description: "Primeros juegos de la noche.",
  },
  {
    time: "Por confirmar",
    title: "Rifas",
    description: "Premios especiales y pausas de entretenimiento.",
  },
  {
    time: "Por confirmar",
    title: "Presentacion especial",
    description: "Espacio musical o cultural sujeto a programacion.",
  },
  {
    time: "Por confirmar",
    title: "Premio mayor",
    description: "Juego principal de cierre.",
  },
  {
    time: "Por confirmar",
    title: "Cierre",
    description: "Agradecimientos y salida organizada.",
  },
];

export const foodOptions = [
  "Perros calientes",
  "Empanadas",
  "Hamburguesas",
  "Pinchos",
  "Bebidas",
  "Postres",
];

export const sponsorPlans = [
  {
    title: "Pendon fisico",
    price: "Precio por confirmar",
    benefits: [
      "Presencia visible durante el evento",
      "Mencion como aliado",
      "Ubicacion sujeta a disponibilidad",
    ],
  },
  {
    title: "Publicidad digital",
    price: "Precio por confirmar",
    benefits: [
      "Publicacion en piezas digitales",
      "Espacio para logo o mensaje",
      "Alcance en comunidad educativa",
    ],
  },
  {
    title: "Plan combinado",
    price: "Precio por confirmar",
    recommended: true,
    benefits: [
      "Pendon fisico y presencia digital",
      "Mayor exposicion",
      "Prioridad en comunicacion del evento",
    ],
  },
];
