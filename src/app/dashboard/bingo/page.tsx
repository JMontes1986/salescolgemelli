"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { defaultBingoContent, type BingoLandingContent } from "@/lib/bingo-data";

type EditableValue = string | number | boolean | null | EditableObject | EditableValue[];
type EditableObject = { [key: string]: EditableValue };

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

  useEffect(() => {
    fetch("/api/dashboard/bingo-content", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setContent(cloneValue(data.content ?? defaultBingoContent));
        setStatus(data.source === "database" ? "Contenido cargado desde Supabase." : "Contenido base cargado. Guarda para publicarlo en Supabase.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "No se pudo cargar el contenido."));
  }, []);

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

  return (
    <div className="w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Editor visual de la landing del Bingo</CardTitle>
          <CardDescription>
            Edita los textos, botones, valores, premios, cronograma, comida y planes desde campos simples. No necesitas escribir JSON ni codigo.
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

          <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
            <aside className="space-y-3 rounded-xl border bg-muted/20 p-4 xl:sticky xl:top-4 xl:self-start">
              <div>
                <h2 className="text-lg font-semibold text-foreground">1. Escoge que vas a editar</h2>
                <p className="text-sm text-muted-foreground">Las secciones estan separadas igual que en la pagina publica para que sea mas facil ubicarlas.</p>
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
    </div>
  );
}
