export function Logo(props: { className?: string }) {
  return (
    <img
      src="https://btwhvavwqkzifiuhgcao.supabase.co/storage/v1/object/sign/ventas/Logo%20Familia.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8wYzNjNTVjNy1iNTM4LTQ5MDUtYTIwYy04ZjllZmEwZDk2NjEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2ZW50YXMvTG9nbyBGYW1pbGlhLnBuZyIsImlhdCI6MTc1ODU1OTM2NCwiZXhwIjoxNzkwMDk1MzY0fQ.ZwfeqtV5Rc9TctUBqM0bhI7Vb0algmM9LlckFd0A3Aw"
      alt="ColGemelli Logo"
      width={150}
      height={50}
      className={props.className}
    />
  );
}
