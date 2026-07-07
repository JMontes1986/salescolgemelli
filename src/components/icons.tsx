import Image from "next/image";

export const MOLLY_LOGO_URL = "/molly-ventas.png";

export function Logo(props: { className?: string }) {
  return (
    <Image
      src={MOLLY_LOGO_URL}
      alt="Logo de Molly Ventas"
      width={180}
      height={72}
      className={props.className ?? "h-16 w-auto object-contain"}
      priority
    />
  );
}
