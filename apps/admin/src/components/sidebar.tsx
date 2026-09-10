'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV } from '@/lib/nav';
import styles from './sidebar.module.css';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar} aria-label="Admin navigation">
      <div className={styles.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wordmark.svg" alt="Laandry" className={styles.brandLogo} />
        <span className={styles.brandSuffix}>Ops</span>
      </div>
      {NAV.map((section) => (
        <div className={styles.section} key={section.label}>
          <p className={styles.sectionLabel}>{section.label}</p>
          {section.items.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? `${styles.link} ${styles.linkActive}` : styles.link}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
