import { NextResponse } from "next/server";
import { getBingoPreSaleTablesSold } from "@/lib/bingo-data";

export async function GET() {
  const tablesSold = await getBingoPreSaleTablesSold();

  return NextResponse.json(
    { tablesSold },
    { headers: { "Cache-Control": "no-store" } },
  );
}
