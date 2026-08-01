"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, Eye, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { defaultBingoContent, type BingoLandingContent } from "@/lib/bingo-data";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";

const BINGO_DASHBOARD_REALTIME_TABLES = ['bingo_landing_content', 'bingo_registrations', 'bingo_landing_views'] as const;

type EditableValue = string | number | boolean | null | EditableObject | EditableValue[];
type EditableObject = { [key: string]: EditableValue };

type BingoRegistration = {
  id: string;
  created_at: string;
  full_name: string;
  document_number: string;
  phone: string;
  email: string;
  grade_course: string;
  student_name: string;
  attendees: number;
  tables: number;
  notes: string;
  source: string;
};

type BingoViewStats = {
  totalViews: number;
  updatedAt: string | null;
  browserSummary: Record<string, number>;
  deviceSummary: Record<string, number>;
  recentViews: Array<{
    id: string;
    viewed_at: string;
    browser: string;
    device: string;
  }>;
};

type EditableTextTarget = {
  key: string;
  label: string;
  path: (string | number)[];
  fallback: string;
  tone?: "dark" | "light";
};

const fieldLabels: Record<string, string> = {
  whatsappMessage: "Mensaje de WhatsApp",
  hero: "Encabezado principal",
  navLabel: "Texto del menu",
  badge: "Etiqueta pequena",
  title: "Titulo",
  eyebrow: "Texto superior",
  description: "Descripcion",
  primaryCta: "Boton principal",
  secondaryCta: "Boton secundario",
  awardsCta: "Boton de premios",
  event: "Datos del evento",
  date: "Fecha",
  time: "Hora",
  place: "Lugar",
  tablePrice: "Valor de tabla",
  entrance: "Valor de entrada",
  mainPrize: "Premio mayor",
  payment: "Forma de pago",
  games: "Cantidad de juegos",
  pendingNote: "Nota de datos pendientes",
  intro: "Introduccion",
  paragraphs: "Parrafos",
  stats: "Indicadores",
  value: "Valor",
  label: "Etiqueta",
  backgroundImageUrl: "Imagen de fondo",
  information: "Informacion esencial",
  pendingText: "Texto pendiente",
  paymentAlert: "Aviso de pago",
  reasons: "Razones para asistir",
  icon: "Icono",
  prizes: "Premios",
  featuredNote: "Nota destacada",
  cards: "Tarjetas",
  featured: "Destacado",
  participation: "Como participar",
  steps: "Pasos",
  schedule: "Cronograma",
  items: "Elementos",
  video: "Video promocional",
  status: "Estado",
  gallery: "Galeria",
  caption: "Pie de foto",
  food: "Zona gastronomica",
  options: "Opciones",
  donations: "Donaciones",
  cta: "Boton",
  sponsors: "Publicidad para empresas",
  recommendedLabel: "Etiqueta recomendado",
  plans: "Planes",
  price: "Precio",
  benefits: "Beneficios",
  recommended: "Recomendado",
  confirmation: "Confirmacion",
  whatsappCta: "Boton de WhatsApp",
  footer: "Pie de pagina",
  text: "Texto",
  backLink: "Enlace de regreso",
};

const sectionHelp: Record<string, string> = {
  "whatsappMessage": "Mensaje que se abre automaticamente cuando alguien escribe por WhatsApp.",
  "hero": "Textos visibles en la primera pantalla de la pagina publica.",
  "event": "Datos rapidos del evento: fecha, lugar, valores y notas.",
  "intro": "Bloque de presentacion de la actividad.",
  "stats": "Numeros o datos cortos que se muestran como indicadores.",
  "information": "Bloque de informacion importante para las familias.",
  "reasons": "Tarjetas con motivos para asistir al bingo.",
  "prizes": "Seccion donde se publican premios y donantes.",
  "participation": "Pasos para comprar, reservar o asistir.",
  "schedule": "Agenda o cronograma de la noche.",
  "video": "Textos del bloque de video promocional.",
  "gallery": "Textos para la galeria de fotos.",
  "food": "Comidas o productos que se ofreceran.",
  "donations": "Invitacion para donar premios.",
  "sponsors": "Planes de publicidad para empresas aliadas.",
  "confirmation": "Textos del formulario de confirmacion.",
  "footer": "Textos finales de la pagina.",
};

const editorSections = [
  { key: "hero", title: "Portada", description: "Titulos, botones principales y textos de la primera pantalla." },
  { key: "event", title: "Datos del evento", description: "Fecha, hora, lugar, precios y notas importantes." },
  { key: "intro", title: "Presentacion", description: "Texto introductorio para explicar el proposito del Bingo." },
  { key: "stats", title: "Indicadores", description: "Numeros destacados como familias, tablas, premios o aliados." },
  { key: "information", title: "Informacion esencial", description: "Avisos relevantes para familias y forma de pago." },
  { key: "reasons", title: "Razones para asistir", description: "Tarjetas con beneficios o motivos para participar." },
  { key: "prizes", title: "Premios", description: "Premios principales, donantes y notas destacadas." },
  { key: "participation", title: "Como participar", description: "Pasos que deben seguir las familias para asistir." },
  { key: "schedule", title: "Cronograma", description: "Momentos y horarios de la noche del evento." },
  { key: "video", title: "Video", description: "Textos del bloque de video promocional." },
  { key: "gallery", title: "Galeria", description: "Textos y pie de foto de la galeria publica." },
  { key: "food", title: "Comida", description: "Opciones de la zona gastronomica." },
  { key: "donations", title: "Donaciones", description: "Invitacion para familias o empresas donantes." },
  { key: "sponsors", title: "Publicidad", description: "Planes y beneficios para patrocinadores." },
  { key: "confirmation", title: "Formulario", description: "Textos de confirmacion y boton de WhatsApp." },
  { key: "footer", title: "Pie de pagina", description: "Texto final y enlace de regreso." },
] as const;

const visualTextTargets: EditableTextTarget[] = [
  { key: "hero.title", label: "Titulo principal", path: ["hero", "title"], fallback: defaultBingoContent.hero.title, tone: "light" },
  { key: "hero.description", label: "Descripcion principal", path: ["hero", "description"], fallback: defaultBingoContent.hero.description, tone: "light" },
  { key: "information.title", label: "Titulo informacion", path: ["information", "title"], fallback: defaultBingoContent.information.title },
  { key: "information.description", label: "Texto informacion", path: ["information", "description"], fallback: defaultBingoContent.information.description },
  { key: "food.title", label: "Titulo gastronomia", path: ["food", "title"], fallback: defaultBingoContent.food.title },
  { key: "food.description", label: "Texto gastronomia", path: ["food", "description"], fallback: defaultBingoContent.food.description },
  { key: "participation.title", label: "Titulo participacion", path: ["participation", "title"], fallback: defaultBingoContent.participation.title },
  { key: "participation.description", label: "Texto participacion", path: [], fallback: "Reserva, confirma y ven preparado para disfrutar una noche familiar llena de premios, encuentro y alegria gemellista." },
  { key: "sponsors.title", label: "Titulo publicidad", path: ["sponsors", "title"], fallback: defaultBingoContent.sponsors.title },
  { key: "sponsors.description", label: "Texto publicidad", path: [], fallback: "Haz que tu marca o tu aporte sea parte de una noche que une a las familias y deja huella en el colegio." },
  { key: "confirmation.title", label: "Titulo confirmacion", path: ["confirmation", "title"], fallback: defaultBingoContent.confirmation.title, tone: "light" },
  { key: "confirmation.description", label: "Texto confirmacion", path: ["confirmation", "description"], fallback: defaultBingoContent.confirmation.description, tone: "light" },
];

type EditorSectionKey = typeof editorSections[number]["key"];

function isObject(value: EditableValue): value is EditableObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getLabel(key: string, fallback: string) {
  return fieldLabels[key] ?? fallback.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function updateAtPath(value: EditableValue, path: (string | number)[], nextValue: EditableValue): EditableValue {
  if (path.length === 0) return nextValue;
  const [head, ...tail] = path;
  if (Array.isArray(value)) {
    return value.map((item, index) => (index === head ? updateAtPath(item, tail, nextValue) : item));
  }
  if (isObject(value) && typeof head === "string") {
    return { ...value, [head]: updateAtPath(value[head], tail, nextValue) };
  }
  return value;
}

function addArrayItem(value: EditableValue, path: (string | number)[]): EditableValue {
  const target = path.reduce<EditableValue>((current, part) => (Array.isArray(current) ? current[Number(part)] : isObject(current) ? current[String(part)] : null), value);
  if (!Array.isArray(target)) return value;
  const template = target[0];
  const emptyItem = typeof template === "string" ? "" : typeof template === "number" ? 0 : typeof template === "boolean" ? false : cloneValue(template ?? "");
  return updateAtPath(value, path, [...target, emptyItem]);
}

function removeArrayItem(value: EditableValue, path: (string | number)[], removeIndex: number): EditableValue {
  const target = path.reduce<EditableValue>((current, part) => (Array.isArray(current) ? current[Number(part)] : isObject(current) ? current[String(part)] : null), value);
  if (!Array.isArray(target) || target.length <= 1) return value;
  return updateAtPath(value, path, target.filter((_, index) => index !== removeIndex));
}

function formatRegistrationDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function escapeCsvValue(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });
}

function readAtPath(value: EditableValue, path: (string | number)[]): EditableValue {
  return path.reduce<EditableValue>((current, part) => (
    Array.isArray(current) ? current[Number(part)] : isObject(current) ? current[String(part)] : null
  ), value);
}

function getInlineTextStyle(style?: BingoLandingContent["design"]["textStyles"][string]) {
  return {
    ...(style?.fontSize ? { fontSize: `${style.fontSize}px` } : {}),
    ...(style?.color ? { color: style.color } : {}),
    ...(style?.bold !== undefined ? { fontWeight: style.bold ? 900 : 500 } : {}),
    ...(style?.underline ? { textDecoration: "underline" } : {}),
    ...(style?.shadow ? { textShadow: "0 10px 28px rgba(0,0,0,0.35)" } : {}),
  };
}

function FieldEditor({ fieldKey, value, path, onChange, onAddItem, onRemoveItem }: {
  fieldKey: string;
  value: EditableValue;
  path: (string | number)[];
  onChange: (path: (string | number)[], value: EditableValue) => void;
  onAddItem: (path: (string | number)[]) => void;
  onRemoveItem: (path: (string | number)[], index: number) => void;
}) {
  const label = getLabel(fieldKey, String(fieldKey));

  if (Array.isArray(value)) {
    const simpleList = value.every((item) => typeof item === "string" || typeof item === "number");
    return (
      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-foreground">{label}</h3>
            <p className="text-xs text-muted-foreground">Agrega, elimina o edita cada elemento sin modificar codigo.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onAddItem(path)}><Plus className="mr-2 h-4 w-4" />Agregar</Button>
        </div>
        <div className="space-y-3">
          {value.map((item, index) => (
            <div key={`${path.join("-")}-${index}`} className="rounded-md border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Label>{simpleList ? `${label} ${index + 1}` : `Elemento ${index + 1}`}</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveItem(path, index)} disabled={value.length <= 1}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <FieldEditor fieldKey={simpleList ? fieldKey : `${fieldKey} ${index + 1}`} value={item} path={[...path, index]} onChange={onChange} onAddItem={onAddItem} onRemoveItem={onRemoveItem} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isObject(value)) {
    return (
      <section className="space-y-4 rounded-xl border p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{label}</h2>
          {sectionHelp[path.join(".") || fieldKey] || sectionHelp[fieldKey] ? <p className="text-sm text-muted-foreground">{sectionHelp[path.join(".") || fieldKey] ?? sectionHelp[fieldKey]}</p> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(value).map(([key, item]) => (
            <div key={key} className={isObject(item) || Array.isArray(item) ? "md:col-span-2" : "space-y-2"}>
              <FieldEditor fieldKey={key} value={item} path={[...path, key]} onChange={onChange} onAddItem={onAddItem} onRemoveItem={onRemoveItem} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (typeof value === "boolean") {
    return (
      <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
        <input type="checkbox" checked={value} onChange={(event) => onChange(path, event.target.checked)} className="h-4 w-4" />
        <span>{label}</span>
      </label>
    );
  }

  const text = value === null ? "" : String(value);
  const multiline = text.length > 80 || ["description", "paymentAlert", "whatsappMessage", "text"].includes(fieldKey);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {multiline ? (
        <Textarea value={text} onChange={(event) => onChange(path, event.target.value)} className="min-h-24" />
      ) : (
        <Input value={text} onChange={(event) => onChange(path, typeof value === "number" ? Number(event.target.value) : event.target.value)} />
      )}
    </div>
  );
}

export default function BingoContentAdminPage() {
  const [content, setContent] = useState<BingoLandingContent>(() => cloneValue(defaultBingoContent));
  const [status, setStatus] = useState("Cargando contenido editable...");
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<EditorSectionKey>("hero");
  const [registrations, setRegistrations] = useState<BingoRegistration[]>([]);
  const [registrationsStatus, setRegistrationsStatus] = useState("Cargando registros...");
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [viewStats, setViewStats] = useState<BingoViewStats>({
    totalViews: 0,
    updatedAt: null,
    browserSummary: {},
    deviceSummary: {},
    recentViews: [],
  });
  const [viewsStatus, setViewsStatus] = useState("Cargando visitas...");
  const [loadingViews, setLoadingViews] = useState(false);
  const [selectedTextKey, setSelectedTextKey] = useState("hero.title");
  const heroBackgroundImageUrl = content.hero.backgroundImageUrl || "/images/bingo/bingo-card.svg";
  const selectedTextTarget = visualTextTargets.find((target) => target.key === selectedTextKey) ?? visualTextTargets[0];
  const selectedTextValue = selectedTextTarget.path.length > 0
    ? String(readAtPath(content as EditableValue, selectedTextTarget.path) ?? "")
    : selectedTextTarget.fallback;
  const selectedTextStyle = content.design?.textStyles?.[selectedTextTarget.key] ?? {};

  useEffect(() => {
    fetch("/api/dashboard/bingo-content", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setContent(cloneValue(data.content ?? defaultBingoContent));
        setStatus(data.source === "database" ? "Contenido cargado desde Supabase." : "Contenido base cargado. Guarda para publicarlo en Supabase.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "No se pudo cargar el contenido."));
  }, []);

  const loadRegistrations = async () => {
    setLoadingRegistrations(true);
    setRegistrationsStatus("Consultando registros...");
    try {
      const response = await fetch("/api/dashboard/bingo-registrations", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? "No se pudieron cargar los registros.");
      const nextRegistrations = Array.isArray(data.registrations) ? data.registrations : [];
      setRegistrations(nextRegistrations);
      setRegistrationsStatus(
        nextRegistrations.length === 1
          ? "1 familia registrada."
          : `${nextRegistrations.length} familias registradas.`,
      );
    } catch (error) {
      setRegistrationsStatus(error instanceof Error ? error.message : "No se pudieron cargar los registros.");
    } finally {
      setLoadingRegistrations(false);
    }
  };

  const loadViewStats = async () => {
    setLoadingViews(true);
    setViewsStatus("Consultando visitas...");
    try {
      const response = await fetch("/api/dashboard/bingo-views", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? "No se pudieron cargar las visitas.");
      setViewStats({
        totalViews: Number(data.totalViews ?? 0),
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
        browserSummary: data.browserSummary && typeof data.browserSummary === "object" ? data.browserSummary : {},
        deviceSummary: data.deviceSummary && typeof data.deviceSummary === "object" ? data.deviceSummary : {},
        recentViews: Array.isArray(data.recentViews) ? data.recentViews : [],
      });
      setViewsStatus("Contador actualizado.");
    } catch (error) {
      setViewsStatus(error instanceof Error ? error.message : "No se pudieron cargar las visitas.");
    } finally {
      setLoadingViews(false);
    }
  };

  useEffect(() => {
    void loadRegistrations();
    void loadViewStats();
  }, []);

  useSupabaseRealtime({
    tables: BINGO_DASHBOARD_REALTIME_TABLES,
    onChange: async () => {
      await Promise.all([loadRegistrations(), loadViewStats()]);
    },
  });

  const exportRegistrationsCsv = () => {
    if (registrations.length === 0) {
      setRegistrationsStatus("No hay registros para exportar.");
      return;
    }

    const headers = [
      "Fecha de registro",
      "Nombre completo",
      "Documento",
      "Telefono",
      "Correo",
      "Grado o curso",
      "Estudiante",
      "Asistentes",
      "Tablas",
      "Observaciones",
      "Origen",
      "ID",
    ];
    const rows = registrations.map((registration) => [
      formatRegistrationDate(registration.created_at),
      registration.full_name,
      registration.document_number,
      registration.phone,
      registration.email,
      registration.grade_course,
      registration.student_name,
      registration.attendees,
      registration.tables,
      registration.notes,
      registration.source,
      registration.id,
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\r\n");
    const csvBlob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const csvUrl = URL.createObjectURL(csvBlob);
    const link = document.createElement("a");
    link.href = csvUrl;
    link.download = "registros_bingo_colgemelli.csv";
    link.click();
    URL.revokeObjectURL(csvUrl);
  };

  const saveContent = async () => {
    setSaving(true);
    setStatus("Guardando cambios...");
    try {
      const response = await fetch("/api/dashboard/bingo-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? "No se pudo guardar.");
      setStatus("Contenido guardado. La landing /bingo mostrara estos textos.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo guardar el contenido.");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (path: (string | number)[], value: EditableValue) => {
    setContent((current) => updateAtPath(current as EditableValue, path, value) as BingoLandingContent);
  };

  const handleAddItem = (path: (string | number)[]) => {
    setContent((current) => addArrayItem(current as EditableValue, path) as BingoLandingContent);
  };

  const handleRemoveItem = (path: (string | number)[], index: number) => {
    setContent((current) => removeArrayItem(current as EditableValue, path, index) as BingoLandingContent);
  };

  const handleVisualTextChange = (value: string) => {
    if (selectedTextTarget.path.length === 0) return;
    handleChange(selectedTextTarget.path, value);
  };

  const updateSelectedTextStyle = (
    patch: Partial<BingoLandingContent["design"]["textStyles"][string]>,
  ) => {
    setContent((current) => ({
      ...current,
      design: {
        ...(current.design ?? { textStyles: {} }),
        textStyles: {
          ...(current.design?.textStyles ?? {}),
          [selectedTextTarget.key]: {
            ...(current.design?.textStyles?.[selectedTextTarget.key] ?? {}),
            ...patch,
          },
        },
      },
    }));
  };

  const handleHeroBackgroundUpload = async (file?: File) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setStatus("Selecciona un archivo de imagen valido.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setStatus("La imagen debe pesar maximo 2 MB para publicarse rapido en la landing.");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      handleChange(["hero", "backgroundImageUrl"], dataUrl);
      setStatus("Imagen cargada en el editor. Guarda cambios para publicarla.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo cargar la imagen.");
    }
  };

  return (
    <div className="w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Editor visual de la landing del Bingo</CardTitle>
          <CardDescription>
            Edita la pagina como un lienzo: selecciona un texto, cambia su contenido y aplica estilo con controles visuales.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p><strong>Ruta publica:</strong> /bingo</p>
              <p>Elige una seccion, edita sus campos y publica con <strong>Guardar cambios</strong>. No tienes que buscar entre toda la landing a la vez.</p>
            </div>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href="/bingo" target="_blank" rel="noreferrer"><Eye className="mr-2 h-4 w-4" />Ver landing</a>
            </Button>
          </div>

          <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <div className="overflow-hidden rounded-xl border bg-[#232328] text-white shadow-sm">
              <div className="border-b border-white/12 px-5 py-4">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-white/50">Lienzo editable</p>
                <h2 className="mt-1 text-xl font-black">Vista rapida de textos principales</h2>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                {visualTextTargets.map((target) => {
                  const value = target.path.length > 0
                    ? String(readAtPath(content as EditableValue, target.path) ?? "")
                    : target.fallback;
                  const style = getInlineTextStyle(content.design?.textStyles?.[target.key]);
                  const selected = selectedTextKey === target.key;

                  return (
                    <button
                      key={target.key}
                      type="button"
                      onClick={() => setSelectedTextKey(target.key)}
                      className={`min-h-28 rounded-lg border p-4 text-left transition hover:-translate-y-0.5 ${
                        selected
                          ? "border-[#ecc643] bg-white text-[#232328]"
                          : target.tone === "light"
                            ? "border-white/14 bg-white/10 text-white"
                            : "border-white/14 bg-[#fffdf7] text-[#232328]"
                      }`}
                    >
                      <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${selected ? "text-[#b23178]" : "text-current opacity-60"}`}>
                        {target.label}
                      </span>
                      <span className="mt-3 block text-xl font-black leading-tight" style={style}>
                        {value}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="space-y-4 rounded-xl border bg-background p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
              <div>
                <p className="text-sm font-medium text-primary">Texto seleccionado</p>
                <h2 className="text-xl font-semibold text-foreground">{selectedTextTarget.label}</h2>
              </div>
              <div className="space-y-2">
                <Label>Contenido</Label>
                <Textarea
                  value={selectedTextValue}
                  onChange={(event) => handleVisualTextChange(event.target.value)}
                  disabled={selectedTextTarget.path.length === 0}
                  className="min-h-28"
                />
                {selectedTextTarget.path.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Este subtitulo es fijo por ahora; puedes cambiar su estilo visual.</p>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="visual-font-size">Tamano de letra</Label>
                  <Input
                    id="visual-font-size"
                    type="number"
                    min={12}
                    max={96}
                    value={selectedTextStyle.fontSize ?? ""}
                    onChange={(event) => updateSelectedTextStyle({ fontSize: event.target.value ? Number(event.target.value) : undefined })}
                    placeholder="Automatico"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visual-color">Color</Label>
                  <Input
                    id="visual-color"
                    type="color"
                    value={selectedTextStyle.color ?? (selectedTextTarget.tone === "light" ? "#ffffff" : "#232328")}
                    onChange={(event) => updateSelectedTextStyle({ color: event.target.value })}
                    className="h-11 p-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button type="button" variant={selectedTextStyle.bold ? "default" : "outline"} onClick={() => updateSelectedTextStyle({ bold: !selectedTextStyle.bold })}>
                  B
                </Button>
                <Button type="button" variant={selectedTextStyle.underline ? "default" : "outline"} onClick={() => updateSelectedTextStyle({ underline: !selectedTextStyle.underline })}>
                  <span className="underline">U</span>
                </Button>
                <Button type="button" variant={selectedTextStyle.shadow ? "default" : "outline"} onClick={() => updateSelectedTextStyle({ shadow: !selectedTextStyle.shadow })}>
                  Sombra
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setContent((current) => {
                    const nextStyles = { ...(current.design?.textStyles ?? {}) };
                    delete nextStyles[selectedTextTarget.key];
                    return { ...current, design: { ...(current.design ?? { textStyles: {} }), textStyles: nextStyles } };
                  });
                }}
              >
                Limpiar estilo
              </Button>
            </aside>
          </section>

          <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
            <aside className="space-y-3 rounded-xl border bg-muted/20 p-4 xl:sticky xl:top-4 xl:self-start">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Edicion avanzada</h2>
                <p className="text-sm text-muted-foreground">Usa esta parte si necesitas tocar listas, fechas, botones, cronograma o campos internos.</p>
              </div>
              <div className="space-y-2">
                {editorSections.map((section, index) => {
                  const selected = activeSection === section.key;
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => setActiveSection(section.key)}
                      className={`w-full rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-background ${selected ? "border-primary bg-background shadow-sm" : "bg-background/60"}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        {selected ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <span className="grid h-4 w-4 place-items-center rounded-full border text-[10px] text-muted-foreground">{index + 1}</span>}
                        {section.title}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{section.description}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="space-y-5">
              <section className="rounded-xl border p-4 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Mensaje inicial de WhatsApp</h2>
                  <p className="text-sm text-muted-foreground">Este campo se mantiene siempre visible porque afecta varios botones de contacto.</p>
                </div>
                <FieldEditor fieldKey="whatsappMessage" value={content.whatsappMessage as EditableValue} path={["whatsappMessage"]} onChange={handleChange} onAddItem={handleAddItem} onRemoveItem={handleRemoveItem} />
              </section>

              <section className="space-y-4 rounded-xl border p-4 shadow-sm">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Imagen de fondo de portada</h2>
                  <p className="text-sm text-muted-foreground">La imagen actual del fondo mide 1200 x 800 px. Usa una imagen horizontal parecida para que se vea bien en computador y celular.</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                  <div className="relative aspect-[3/2] overflow-hidden rounded-lg border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={heroBackgroundImageUrl} alt="Vista previa del fondo de portada" className="h-full w-full object-cover" />
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="hero-background-url">URL de imagen</Label>
                      <Input
                        id="hero-background-url"
                        value={heroBackgroundImageUrl}
                        onChange={(event) => handleChange(["hero", "backgroundImageUrl"], event.target.value)}
                        placeholder="/images/bingo/bingo-card.svg"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hero-background-upload">Subir imagen</Label>
                      <Input
                        id="hero-background-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(event) => void handleHeroBackgroundUpload(event.target.files?.[0])}
                      />
                      <p className="text-xs text-muted-foreground">Recomendado: 1200 x 800 px o proporcion 3:2. Peso maximo: 2 MB.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleChange(["hero", "backgroundImageUrl"], "/images/bingo/bingo-card.svg")}
                    >
                      Restaurar imagen original
                    </Button>
                  </div>
                </div>
              </section>

              <section className="space-y-4 rounded-xl border p-4 shadow-sm">
                <div>
                  <p className="text-sm font-medium text-primary">2. Editando ahora</p>
                  <h2 className="text-2xl font-semibold text-foreground">{editorSections.find((section) => section.key === activeSection)?.title}</h2>
                  <p className="text-sm text-muted-foreground">{editorSections.find((section) => section.key === activeSection)?.description}</p>
                </div>
                <FieldEditor fieldKey={activeSection} value={content[activeSection] as EditableValue} path={[activeSection]} onChange={handleChange} onAddItem={handleAddItem} onRemoveItem={handleRemoveItem} />
              </section>
            </div>
          </section>

          <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{status}</p>
            <Button onClick={saveContent} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Visitas de la landing</CardTitle>
            <CardDescription>
              Conteo de navegadores que han abierto la pagina publica /bingo durante su sesion.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={loadViewStats} disabled={loadingViews}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingViews ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <div>
              <p className="text-sm text-muted-foreground">{viewsStatus}</p>
              <p className="mt-3 text-5xl font-black tracking-tight text-foreground">
                {new Intl.NumberFormat("es-CO").format(viewStats.totalViews)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {viewStats.updatedAt
                  ? `Ultima visita registrada: ${formatRegistrationDate(viewStats.updatedAt)}`
                  : "Todavia no hay visitas registradas."}
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border bg-muted/20 p-4">
                <h3 className="text-sm font-semibold text-foreground">Por dispositivo</h3>
                <div className="mt-3 grid gap-2">
                  {Object.entries(viewStats.deviceSummary).length > 0 ? (
                    Object.entries(viewStats.deviceSummary).map(([label, count]) => (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-bold">{count}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin datos de dispositivo.</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4">
                <h3 className="text-sm font-semibold text-foreground">Por navegador</h3>
                <div className="mt-3 grid gap-2">
                  {Object.entries(viewStats.browserSummary).length > 0 ? (
                    Object.entries(viewStats.browserSummary).map(([label, count]) => (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-bold">{count}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin datos de navegador.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" asChild>
                <a href="/bingo" target="_blank" rel="noreferrer">
                  <Eye className="mr-2 h-4 w-4" />
                  Ver pagina publica
                </a>
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Navegador</TableHead>
                  <TableHead>Dispositivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewStats.recentViews.length > 0 ? (
                  viewStats.recentViews.map((view) => (
                    <TableRow key={view.id}>
                      <TableCell className="min-w-40 whitespace-nowrap">{formatRegistrationDate(view.viewed_at)}</TableCell>
                      <TableCell>{view.browser || "Desconocido"}</TableCell>
                      <TableCell>{view.device || "Desconocido"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                      Todavia no hay visitas detalladas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Familias registradas</CardTitle>
            <CardDescription>
              Consulta las confirmaciones recibidas desde la landing publica del bingo y descarga todos los datos en CSV.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={loadRegistrations} disabled={loadingRegistrations}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loadingRegistrations ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            <Button type="button" onClick={exportRegistrationsCsv} disabled={registrations.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{registrationsStatus}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Curso</TableHead>
                <TableHead>Estudiante</TableHead>
                <TableHead>Asist.</TableHead>
                <TableHead>Tablas</TableHead>
                <TableHead>Observaciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.length > 0 ? (
                registrations.map((registration) => (
                  <TableRow key={registration.id}>
                    <TableCell className="min-w-36 whitespace-nowrap">{formatRegistrationDate(registration.created_at)}</TableCell>
                    <TableCell className="min-w-44 font-medium">{registration.full_name}</TableCell>
                    <TableCell className="min-w-32">{registration.document_number || "-"}</TableCell>
                    <TableCell className="min-w-32">{registration.phone}</TableCell>
                    <TableCell className="min-w-48">{registration.email || "-"}</TableCell>
                    <TableCell className="min-w-32">{registration.grade_course}</TableCell>
                    <TableCell className="min-w-44">{registration.student_name}</TableCell>
                    <TableCell>{registration.attendees}</TableCell>
                    <TableCell>{registration.tables}</TableCell>
                    <TableCell className="min-w-64">{registration.notes || "-"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    {loadingRegistrations ? "Cargando registros..." : "Todavia no hay familias registradas."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
