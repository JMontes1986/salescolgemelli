import type { Metadata } from 'next';

const SELF_SERVICE_URL = 'https://salescolgemelli.vercel.app/self-service';
const OG_IMAGE_URL = 'https://salescolgemelli.vercel.app/og-image.png';
const TITLE = 'Autogestión de pedidos - Ventas ColGemelli';
const DESCRIPTION = 'Compre productos del Colegio Gemelli, consulte sus pedidos por cédula y reciba códigos QR para pago y entrega segura.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: SELF_SERVICE_URL,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: SELF_SERVICE_URL,
    siteName: 'Ventas ColGemelli',
    locale: 'es_CO',
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: 'Vista social de autogestión de pedidos de Ventas ColGemelli',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE_URL],
  },
};

export default function SelfServiceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
