"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

export function LocalQrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    QRCode.toDataURL(value, { width: 320, margin: 2, errorCorrectionLevel: "M", color: { dark: "#073b72", light: "#ffffff" } })
      .then((url) => { if (active) setSrc(url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [value]);
  if (failed) return <p role="alert" className="text-sm text-destructive">No se pudo generar el QR.</p>;
  if (!src) return <div aria-label="Generando código QR" className={cn("h-44 w-44 animate-pulse rounded-xl bg-muted", className)} />;
  // Data URL is generated locally by qrcode; next/image does not optimize it.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={label} width={320} height={320} className={cn("h-44 w-44 rounded-xl border bg-white p-2", className)} />;
}
