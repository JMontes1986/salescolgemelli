import { NextResponse } from "next/server";
import { getBingoFoodProducts } from "@/lib/bingo-data";

export async function GET() {
  const products = await getBingoFoodProducts();

  return NextResponse.json(
    { products },
    { headers: { "Cache-Control": "no-store" } },
  );
}
