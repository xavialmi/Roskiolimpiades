import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Roskiolimpiades', description: 'Totes les competicions, tots els participants i una classificació general acumulada.' };
export const viewport: Viewport = { themeColor: '#0c100e', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ca"><body>{children}</body></html>; }
