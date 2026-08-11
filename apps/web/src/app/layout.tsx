// File: src/app/layout.tsx
// Purpose: Root layout for the entire Next.js app
// Depends on: components/providers.tsx

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'TrustEngine — Turn Every Customer into a 5-Star Review',
  description:
    'AI-powered reputation management for service businesses. Capture feedback, resolve issues, and drive 5-star reviews.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
