'use client';

import { useEffect } from 'react';

import { restoreSession } from '@/lib/auth-store';

/**
 * Runs once, for every route (including /login) — tries the stored
 * session before anything renders a "you're signed out" state. Renders
 * nothing itself; (protected)/layout.tsx and the auth pages read the
 * result via useAuth(). Same restoreSession()-on-mount pattern as
 * apps/app's _layout.tsx, just wrapped in its own client component since
 * Next's root layout is a server component (next/font requires it).
 */
export function AuthBootstrap() {
  useEffect(() => {
    void restoreSession();
  }, []);
  return null;
}
