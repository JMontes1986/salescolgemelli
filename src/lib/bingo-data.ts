import { CalendarDays, Gift, HeartHandshake, MapPin, Music2, Sparkles, Ticket } from "lucide-react";

export type BingoPrize = {
  title: string;
  description: string;
  accent: string;
};

export type BingoFaq = {
  question: string;
  answer: string;
};

export const bingoHighlights = [
  {
    icon: Ticket,
    title: "Cartones para toda la familia",
    description: "Compra, reserva y comparte tus cartones para participar en las rondas del Bingo Gemellista.",
  },
  {
    icon: Gift,
    title: "Premios especiales",
    description: "Disfruta una jornada con premios, sorpresas y actividades para apoyar al Colegio Gemelli.",
  },
  {
    icon: Music2,
    title: "Ambiente familiar",
    description: "Una experiencia pensada para estudiantes, familias, egresados y comunidad gemellista.",
  },
  {
    icon: HeartHandshake,
    title: "Aporte comunitario",
    description: "Cada participación suma al fortalecimiento de los proyectos institucionales del colegio.",
  },
];

export const bingoEventDetails = [
  {
    icon: CalendarDays,
    label: "Fecha",
    value: "Próximamente",
    description: "Publicaremos la fecha oficial en los canales del colegio.",
  },
  {
    icon: MapPin,
    label: "Lugar",
    value: "Colegio Gemelli",
    description: "Encuentro presencial para la comunidad educativa.",
  },
  {
    icon: Sparkles,
    label: "Experiencia",
    value: "Bingo familiar",
    description: "Rondas, premios y momentos de integración.",
  },
];

export const bingoPrizes: BingoPrize[] = [
  {
    title: "Premios mayores",
    description: "Rondas centrales con premios destacados para mantener la emoción hasta el final.",
    accent: "from-amber-300 to-orange-400",
  },
  {
    title: "Sorpresas gemellistas",
    description: "Activaciones y detalles para celebrar la participación de la comunidad.",
    accent: "from-fuchsia-300 to-pink-500",
  },
  {
    title: "Premios familiares",
    description: "Opciones pensadas para que todos puedan disfrutar la jornada.",
    accent: "from-cyan-300 to-blue-500",
  },
];

export const bingoFaqs: BingoFaq[] = [
  {
    question: "¿Dónde estará publicada la información oficial?",
    answer: "En esta página y en los canales institucionales del Colegio Gemelli.",
  },
  {
    question: "¿La landing pertenece al mismo sitio de ventas?",
    answer: "Sí. Ahora el Bingo Gemellista vive dentro del deploy principal de Sales Col Gemelli en /bingo.",
  },
  {
    question: "¿Puedo volver al sistema de ventas?",
    answer: "Sí. Usa el enlace al inicio para regresar al acceso del sistema principal.",
  },
];
