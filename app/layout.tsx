import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Roskiolimpiades',
  description: 'Totes les competicions, tots els participants i una classificació general acumulada.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/roskiolimpiades-icon.jpg', type: 'image/jpeg' }],
    shortcut: [{ url: '/roskiolimpiades-icon.jpg', type: 'image/jpeg' }],
    apple: [{ url: '/apple-touch-icon.jpg', type: 'image/jpeg' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0c100e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ca">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.jpg" sizes="180x180" />
    </head>
      <body>{children}</body>
    </html>
  );
}
