import type { Metadata } from "next";
import { BingoPreviewLanding } from "@/components/bingo/BingoPreviewLanding";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Bingo Gemellista | Colegio Gemelli",
  description: "Informaci\u00f3n y memoria visual del Bingo Gemellista.",
  alternates: { canonical: `${siteConfig.url}${siteConfig.bingoPath}` },
  openGraph: {
    title: "Bingo Gemellista",
    description: "Encuentro de la familia gemellista. Pr\u00f3ximamente publicaremos la informaci\u00f3n para participar.",
    url: `${siteConfig.url}${siteConfig.bingoPath}`,
    siteName: "Colegio Gemelli",
    type: "website",
    locale: "es_CO",
    images: [{ url: `${siteConfig.url}/images/bingo/gallery/28334.jpg`, width: 685, height: 917, alt: "Bingo Gemellista 2026" }],
  },
};

export default function BingoPage() {
  return <BingoPreviewLanding />;
}
