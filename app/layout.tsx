import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Roskiolimpiades',
  description: 'Totes les competicions, tots els participants i una classificació general acumulada.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/roskiolimpiades-icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-touch-icon.png?v=3', type: 'image/png', sizes: '180x180' }],
    shortcut: [{ url: '/roskiolimpiades-icon.svg', type: 'image/svg+xml' }],
  },
};
export const viewport: Viewport = { themeColor: '#0c100e', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ca"><body>{children}</body></html>; }
