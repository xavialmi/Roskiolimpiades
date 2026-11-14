import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Roskiolimpiades · Bola 8', description: 'Torneig de billar Bola 8 de les Roskiolimpiades.' };
export const viewport: Viewport = { themeColor: '#10120f', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ca"><body>{children}</body></html>; }
