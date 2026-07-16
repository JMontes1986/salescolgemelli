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

async function fetchPreSaleTablesSold() {
  const response = await fetch("/api/bingo/presale-tables", { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as { tablesSold?: number };

  if (!response.ok) {
    throw new Error("No se pudo actualizar el total de tablas en preventa.");
  }

  return Number.isFinite(data.tablesSold) ? Number(data.tablesSold) : 0;
}

export function BingoLandingRealtime({
  initialContent,
  initialTablesSold,
}: {
  initialContent: BingoLandingContent;
  initialTablesSold: number;
}) {
  const [content, setContent] = useState(initialContent);
  const [tablesSold, setTablesSold] = useState(initialTablesSold);

  const refreshContent = useCallback(async () => {
    try {
      setContent(await fetchBingoLandingContent());
    } catch (error) {
      console.error("No se pudo sincronizar la landing del bingo.", error);
    }
  }, []);

  const refreshTablesSold = useCallback(async () => {
    try {
      setTablesSold(await fetchPreSaleTablesSold());
    } catch (error) {
      console.error("No se pudo sincronizar el total de tablas en preventa.", error);
    }
  }, []);

  useSupabaseRealtime({
    tables: ["bingo_landing_content"],
    onChange: refreshContent,
    fallbackIntervalMs: 5_000,
  });

  useSupabaseRealtime({
    tables: ["purchases"],
    onChange: refreshTablesSold,
    fallbackIntervalMs: 5_000,
  });

  return <BingoLanding content={content} tablesSold={tablesSold} />;
}
