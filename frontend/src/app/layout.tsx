import type { Metadata } from 'next';

import { AppProviders } from '@/app/providers/AppProviders';
import { BRAND_NAME, BRAND_TAGLINE } from '@/shared/config/brand';
import { tjJoyOfSinging } from '@/shared/config/fonts';
import { PointerGlow } from '@/shared/ui/pointer-glow/PointerGlow';

import './globals.css';

export const metadata: Metadata = {
  title: `${BRAND_NAME} | ${BRAND_TAGLINE}`,
  description: '방을 만들고 친구와 함께하는 실시간 화상 노래방',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${tjJoyOfSinging.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <AppProviders>{children}</AppProviders>
        <PointerGlow />
      </body>
    </html>
  );
}
