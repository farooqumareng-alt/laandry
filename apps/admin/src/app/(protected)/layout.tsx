'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@laandry/domain';

import { Sidebar } from '@/components/sidebar';
import styles from '@/components/sidebar.module.css';
import { useAuth } from '@/hooks/use-auth';
import { logout } from '@/lib/auth-store';

// Every route in this group is staff-only ops tooling. A customer or
// provider account can authenticate against the same /auth/login this
// console uses (it isn't role-restricted), so this list is the actual
// gate, not just "signed in" — matching the customer/provider role split
// apps/app's RequireAuth draws the opposite way.
const STAFF_ROLES: ReadonlySet<Role> = new Set(['support', 'dispatch', 'finance', 'ops_manager', 'admin', 'super_admin']);

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, textAlign: 'center', maxWidth: 360 }}>{children}</p>
    </div>
  );
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { status, user, mfaEnabled } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'signedOut') {
      router.replace('/login');
    } else if (status === 'signedIn' && user && STAFF_ROLES.has(user.role) && !mfaEnabled) {
      // Every staff role requires MFA (see @laandry/domain requiresMfa) —
      // a staff account that logged in but hasn't enrolled yet gets sent
      // straight to setup before it can see anything in here.
      router.replace('/mfa-setup');
    }
  }, [status, user, mfaEnabled, router]);

  if (status === 'loading' || status === 'signedOut') {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }

  if (!user || !STAFF_ROLES.has(user.role)) {
    return (
      <CenteredMessage>
        This console is for Laandry staff accounts only. Signed in as {user?.email} ({user?.role}).
        <br />
        <br />
        <button
          type="button"
          onClick={() => logout().then(() => router.replace('/login'))}
          style={{ color: 'var(--accent)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
        >
          Sign out and use an ops account
        </button>
      </CenteredMessage>
    );
  }

  if (!mfaEnabled) {
    return <CenteredMessage>Redirecting to MFA setup…</CenteredMessage>;
  }

  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
