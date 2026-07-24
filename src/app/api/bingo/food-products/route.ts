import { NextResponse } from "next/server";
import { getBingoFoodProducts } from "@/lib/bingo-data";

export async function GET() {
  const products = await getBingoFoodProducts("public-cache");

  return NextResponse.json(
    { products },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}
