import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { FloatingThemeToggle } from "@/components/theme-toggle";
import { SecurityAiAssistant } from "@/components/security-ai-assistant";

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
  const themeScript = `
    (() => {
      try {
        const key = 'ventas-colgemelli:theme';
        const storedTheme = localStorage.getItem(key);
        const theme = storedTheme === 'light' || storedTheme === 'dark'
          ? storedTheme
          : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.documentElement.style.colorScheme = theme;
      } catch (_) {}
    })();
  `;

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Source+Serif+4:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <ThemeProvider>
          <FloatingThemeToggle />
          {children}
          <SecurityAiAssistant />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
