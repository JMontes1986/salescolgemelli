import type { ReactNode } from "react";
import { BingoPreviewLanding } from "@/components/bingo/BingoPreviewLanding";
import { getBingoLandingContent } from "@/lib/bingo-data";

export default async function SelfServiceTemplate({
  children,
}: {
  children: ReactNode;
}) {
  const content = await getBingoLandingContent("fresh");

  return content.selfServiceEnabled
    ? children
    : <BingoPreviewLanding showSelfServiceNotice />;
}
