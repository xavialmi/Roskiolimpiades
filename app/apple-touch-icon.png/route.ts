import { ImageResponse } from 'next/og';
import React from 'react';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const assetUrl = new URL('/roskiolimpiades-icon.svg', request.url);
  const response = await fetch(assetUrl, { cache: 'no-store' });
  if (!response.ok) {
    return new Response('No s’ha pogut carregar el logo', { status: 503 });
  }

  const svg = await response.text();
  const match = svg.match(/data:image\/jpeg;base64,([^"]+)/);
  if (!match) {
    return new Response('El logo no conté la imatge esperada', { status: 500 });
  }

  return new ImageResponse(
    React.createElement('div', {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#050605',
      },
      children: React.createElement('img', {
        src: `data:image/jpeg;base64,${match[1]}`,
        width: 180,
        height: 180,
        style: { width: '180px', height: '180px', objectFit: 'cover' },
      }),
    }),
    { width: 180, height: 180, headers: { 'Cache-Control': 'public, max-age=3600, must-revalidate' } },
  );
}
