"use client";

import { useCallback, useState } from "react";
import { BingoLanding } from "./BingoLanding";
import { defaultBingoContent, type BingoLandingContent } from "@/lib/bingo-data";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";

async function fetchBingoLandingContent() {
  const response = await fetch("/api/dashboard/bingo-content", { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as {
    content?: BingoLandingContent;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.message ?? "No se pudo actualizar el contenido del bingo.");
  }

  return data.content ?? defaultBingoContent;
}

export function BingoLandingRealtime({ initialContent }: { initialContent: BingoLandingContent }) {
  const [content, setContent] = useState(initialContent);

  const refreshContent = useCallback(async () => {
    try {
      setContent(await fetchBingoLandingContent());
    } catch (error) {
      console.error("No se pudo sincronizar la landing del bingo.", error);
    }
  }, []);

  useSupabaseRealtime({
    tables: ["bingo_landing_content"],
    onChange: refreshContent,
    fallbackIntervalMs: 5_000,
  });

  return <BingoLanding content={content} />;
}
