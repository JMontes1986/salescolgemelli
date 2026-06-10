import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

const MOLLY_FAVICON_URL = "https://jzygqzrfkvoktbjzlmsr.supabase.co/storage/v1/object/sign/Imagenes/Ventas.ico?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82ZTdkMDFlZS00NGY4LTRhN2MtOGMxMi03OTY4ZDhkN2E1ZTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJJbWFnZW5lcy9WZW50YXMuaWNvIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc4MTExMTg2NSwiZXhwIjoxODEyNjQ3ODY1fQ.zdTzDbe0Cm5veD--ap0d4u6nMxXwRvjts5o9O4d35UU";

export const metadata: Metadata = {
  title: 'Ventas ColGemelli',
  description: 'Sistema de gestión de ventas y tickets para el Colegio Gemelli.',
  icons: {
    icon: [{ url: MOLLY_FAVICON_URL, type: 'image/x-icon' }],
    shortcut: MOLLY_FAVICON_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Source+Serif+4:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
