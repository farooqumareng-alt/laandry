import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Mono, Public_Sans } from 'next/font/google';

import { Sidebar } from '@/components/sidebar';
import styles from '@/components/sidebar.module.css';
import './globals.css';

const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  weight: ['400', '500'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Laandry Ops',
  description: 'Laandry operations command center — not indexed, staff only.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${publicSans.variable} ${ibmPlexMono.variable}`}>
      <body>
        <div className={styles.shell}>
          <Sidebar />
          <main className={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  );
}
