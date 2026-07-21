import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { FloatingThemeToggle } from "@/components/theme-toggle";

const MOLLY_FAVICON_URL = "/molly-ventas.png";
const SITE_URL = "https://salescolgemelli.vercel.app";
const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;
const SITE_TITLE = "Ventas ColGemelli";
const SITE_DESCRIPTION =
  "Sistema de gestión de ventas, preventas, inventario y tickets QR para el Colegio Gemelli de forma segura y centralizada.";

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
    icon: [{ url: MOLLY_FAVICON_URL, type: 'image/png' }],
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
      className=""
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-body antialiased">
        <ThemeProvider>
          <FloatingThemeToggle />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
