import type { Metadata } from "next";
import { BingoLanding } from "@/components/bingo/BingoLanding";
import { siteConfig } from "@/lib/site";

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

export default function BingoPage() {
  return <BingoLanding />;
}
