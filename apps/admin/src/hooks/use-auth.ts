import { useSyncExternalStore } from 'react';

import { getAuthState, subscribeAuth } from '@/lib/auth-store';

export function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);
}
