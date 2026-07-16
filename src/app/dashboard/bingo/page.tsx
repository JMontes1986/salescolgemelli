"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
          <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            Ruta publica: <strong>/bingo</strong>. Los cambios se guardan en Supabase y se aplican al publicar con el boton <strong>Guardar cambios</strong>.
          </div>
          <FieldEditor fieldKey="landing" value={content as EditableValue} path={[]} onChange={handleChange} onAddItem={handleAddItem} onRemoveItem={handleRemoveItem} />
          <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{status}</p>
            <Button onClick={saveContent} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
