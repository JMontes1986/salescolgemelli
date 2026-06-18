import type {Metadata} from 'next';
import { Inter, JetBrains_Mono, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { FloatingThemeToggle } from "@/components/theme-toggle";
import { SecurityAiAssistant } from "@/components/security-ai-assistant";

const MOLLY_FAVICON_URL = "https://jzygqzrfkvoktbjzlmsr.supabase.co/storage/v1/object/sign/Imagenes/Ventas.ico?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82ZTdkMDFlZS00NGY4LTRhN2MtOGMxMi03OTY4ZDhkN2E1ZTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJJbWFnZW5lcy9WZW50YXMuaWNvIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc4MTExMTg2NSwiZXhwIjoxODEyNjQ3ODY1fQ.zdTzDbe0Cm5veD--ap0d4u6nMxXwRvjts5o9O4d35UU";
const SITE_URL = "https://salescolgemelli.netlify.app";
const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;
const SITE_TITLE = "Ventas ColGemelli";
const SITE_DESCRIPTION =
  "Sistema de gestión de ventas, preventas, inventario y tickets QR para el Colegio Gemelli de forma segura y centralizada.";

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  preload: false,
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: 'website',
    url: SITE_URL,
    siteName: SITE_TITLE,
    locale: 'es_CO',
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: 'Vista social de Ventas ColGemelli para gestionar ventas y tickets QR',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_URL],
  },
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
    <html
      lang="es"
      className={`${inter.variable} ${jetBrainsMono.variable} ${sourceSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
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
