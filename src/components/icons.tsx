import Image from "next/image";

export const MOLLY_LOGO_URL = "https://jzygqzrfkvoktbjzlmsr.supabase.co/storage/v1/object/sign/Imagenes/Molly%20Ventas.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82ZTdkMDFlZS00NGY4LTRhN2MtOGMxMi03OTY4ZDhkN2E1ZTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJJbWFnZW5lcy9Nb2xseSBWZW50YXMucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc4MDk2MzEzMywiZXhwIjoxODEyNDk5MTMzfQ.TiJtvBz9h2ixOAaNfi9eHcK3UEjvs08Te3Y43rFhmJ4";

export function Logo(props: { className?: string }) {
  return (
    <Image
      src={MOLLY_LOGO_URL}
      alt="Logo de Molly Ventas"
      width={180}
      height={72}
      className={props.className ?? "h-16 w-auto object-contain"}
    />
  );
}
