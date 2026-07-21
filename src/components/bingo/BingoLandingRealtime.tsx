"use client";

import { useCallback, useEffect, useState } from "react";
import { BingoLanding } from "./BingoLanding";
import { defaultBingoContent, type BingoFoodProduct, type BingoLandingContent } from "@/lib/bingo-data";
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

  const refreshFoodProducts = useCallback(async () => {
    try {
      setFoodProducts(await fetchFoodProducts());
    } catch (error) {
      console.error("No se pudieron sincronizar los productos de la zona gastronomica.", error);
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

  useSupabaseRealtime({
    tables: ["products"],
    onChange: refreshFoodProducts,
    fallbackIntervalMs: 10_000,
  });

  return <BingoLanding content={content} tablesSold={tablesSold} foodProducts={foodProducts} />;
}
