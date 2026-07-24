"use client";

import { useCallback, useEffect, useState } from "react";
import { BingoLanding } from "./BingoLanding";
import { defaultBingoContent, type BingoFoodProduct, type BingoLandingContent } from "@/lib/bingo-data";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";

const BINGO_REALTIME_TABLES = ["bingo_landing_content", "purchases", "products"] as const;

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

async function fetchFoodProducts() {
  const response = await fetch("/api/bingo/food-products", { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as { products?: BingoFoodProduct[] };

  if (!response.ok) {
    throw new Error("No se pudieron actualizar los productos de la zona gastronomica.");
  }

  return Array.isArray(data.products) ? data.products : [];
}

export function BingoLandingRealtime({
  initialContent,
  initialTablesSold,
  initialFoodProducts,
}: {
  initialContent: BingoLandingContent;
  initialTablesSold: number;
  initialFoodProducts: BingoFoodProduct[];
}) {
  const [content, setContent] = useState(initialContent);
  const [tablesSold, setTablesSold] = useState(initialTablesSold);
  const [foodProducts, setFoodProducts] = useState(initialFoodProducts);

  useEffect(() => {
    const sessionKey = "bingo_landing_view_recorded";

    if (window.sessionStorage.getItem(sessionKey)) {
      return;
    }

    window.sessionStorage.setItem(sessionKey, "true");
    fetch("/api/bingo/views", { method: "POST", cache: "no-store" }).catch((error) => {
      console.error("No se pudo registrar la visita a la landing del bingo.", error);
      window.sessionStorage.removeItem(sessionKey);
    });
  }, []);

  const refreshLandingData = useCallback(async () => {
    try {
      const [nextContent, nextTablesSold, nextFoodProducts] = await Promise.all([
        fetchBingoLandingContent(),
        fetchPreSaleTablesSold(),
        fetchFoodProducts(),
      ]);

      setContent(nextContent);
      setTablesSold(nextTablesSold);
      setFoodProducts(nextFoodProducts);
    } catch (error) {
      console.error("No se pudo sincronizar la landing del bingo.", error);
    }
  }, []);

  useSupabaseRealtime({
    tables: BINGO_REALTIME_TABLES,
    onChange: refreshLandingData,
    fallbackIntervalMs: 30_000,
  });

  return <BingoLanding content={content} tablesSold={tablesSold} foodProducts={foodProducts} />;
}
