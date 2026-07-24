import { NextResponse } from "next/server";
import { getBingoPreSaleTablesSold } from "@/lib/bingo-data";

export async function GET() {
  const tablesSold = await getBingoPreSaleTablesSold("public-cache");

  return NextResponse.json(
    { tablesSold },
    { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
  );
}
