import type { Metadata } from "next";
import { BingoLandingRealtime } from "@/components/bingo/BingoLandingRealtime";
import { getBingoLandingContent, getBingoPreSaleTablesSold } from "@/lib/bingo-data";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bingo Gemellista | Sales Col Gemelli",
  description: "Landing oficial del Bingo Gemellista integrada al sitio Sales Col Gemelli.",
  alternates: {
    canonical: `${siteConfig.url}${siteConfig.bingoPath}`,
  },
  openGraph: {
    title: "Bingo Gemellista",
    description: "Participa en el Bingo Gemellista desde el sitio oficial de Sales Col Gemelli.",
    url: `${siteConfig.url}${siteConfig.bingoPath}`,
    siteName: "Sales Col Gemelli",
    type: "website",
    locale: "es_CO",
    images: [
      {
        url: `${siteConfig.url}/images/bingo/bingo-card.svg`,
        width: 1200,
        height: 800,
        alt: "Bingo Gemellista",
      },
    ],
  },
};

export default async function BingoPage() {
  const [content, tablesSold] = await Promise.all([
    getBingoLandingContent(),
    getBingoPreSaleTablesSold(),
  ]);

  return <BingoLandingRealtime initialContent={content} initialTablesSold={tablesSold} />;
}
