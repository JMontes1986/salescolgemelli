"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function BingoContentAdminPage() {
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState("Cargando contenido editable...");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/bingo-content", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setJsonText(JSON.stringify(data.content, null, 2));
        setStatus(data.source === "database" ? "Contenido cargado desde Supabase." : "Contenido base cargado. Guarda para publicarlo en Supabase.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "No se pudo cargar el contenido."));
  }, []);

  const saveContent = async () => {
    setSaving(true);
    setStatus("Validando JSON...");
    try {
      const content = JSON.parse(jsonText) as unknown;
      const response = await fetch("/api/dashboard/bingo-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? "No se pudo guardar.");
      setStatus("Contenido guardado. La landing /bingo mostrara estos textos.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "JSON invalido.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Contenido de la landing del Bingo</CardTitle>
          <CardDescription>
            Edita textos, botones, valores, premios, cronograma, comida y planes desde un solo JSON. Conserva la estructura para que la pagina pueda renderizarse correctamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            Ruta publica: <strong>/bingo</strong>. Cambios guardados en Supabase tabla <strong>bingo_landing_content</strong> con id <strong>default</strong>.
          </div>
          <Textarea value={jsonText} onChange={(event) => setJsonText(event.target.value)} className="min-h-[620px] font-mono text-xs" spellCheck={false} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{status}</p>
            <Button onClick={saveContent} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
