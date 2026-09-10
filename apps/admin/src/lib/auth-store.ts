import { createLaandryClient, LaandryApiError, type AuthUserSummary, type Session } from '@laandry/api-client';

const ACCESS_TOKEN_KEY = 'laandry-admin.accessToken';
const REFRESH_TOKEN_KEY = 'laandry-admin.refreshToken';

// NEXT_PUBLIC_* vars are inlined into the client bundle at build time.
// Falls back to the local API dev server so `npm run dev` works against
// `npm run dev:api` with zero setup — same convention as apps/app's
// EXPO_PUBLIC_API_URL.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: AuthUserSummary | null;
  mfaEnabled: boolean;
  accessToken: string | null;
  refreshToken: string | null;
}

let state: AuthState = { status: 'loading', user: null, mfaEnabled: false, accessToken: null, refreshToken: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthState(): AuthState {
  return state;
}

/**
 * Browser localStorage, same known tradeoff apps/app's web fallback
 * already documents (secure-storage.ts): no httpOnly-cookie session yet,
 * so a browser XSS bug could read the token. Real, not hidden — see that
 * file's comment. Wrapped in try/catch for private-browsing/storage-disabled.
 */
function storageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Session just won't persist across reloads.
  }
}
function storageDelete(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const api = createLaandryClient({
  baseUrl: API_BASE_URL,
  getAuthToken: () => state.accessToken,
});

function persistSession(session: Session): void {
  storageSet(ACCESS_TOKEN_KEY, session.accessToken);
  storageSet(REFRESH_TOKEN_KEY, session.refreshToken);
  setState({
    status: 'signedIn',
    user: session.user,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  });
}

function clearSession(): void {
  storageDelete(ACCESS_TOKEN_KEY);
  storageDelete(REFRESH_TOKEN_KEY);
  setState({ status: 'signedOut', user: null, mfaEnabled: false, accessToken: null, refreshToken: null });
}

/** Called once at app start (see components/session-boundary.tsx). Tries the stored access token, falls back to a refresh, and signs out cleanly if neither works. */
export async function restoreSession(): Promise<void> {
  const accessToken = storageGet(ACCESS_TOKEN_KEY);
  const refreshToken = storageGet(REFRESH_TOKEN_KEY);
  if (!accessToken || !refreshToken) {
    setState({ status: 'signedOut' });
    return;
  }

  setState({ accessToken, refreshToken });
  try {
    const me = await api.me();
    setState({ status: 'signedIn', user: me, mfaEnabled: me.mfaEnabled });
  } catch {
    try {
      const session = await api.refresh(refreshToken);
      persistSession(session);
    } catch {
      clearSession();
    }
  }
}

/** Throws LaandryApiError with code "MFA_REQUIRED" if the account needs an mfaCode — catch that and re-call with one. The session it returns may carry `mfaSetupRequired: true` for a staff account that hasn't enrolled yet — the login page redirects to /mfa-setup in that case. */
export async function login(email: string, password: string, mfaCode?: string): Promise<Session> {
  const session = await api.login({ email, password, mfaCode });
  persistSession(session);
  setState({ mfaEnabled: !session.mfaSetupRequired });
  return session;
}

export async function completeMfaEnrollment(): Promise<void> {
  setState({ mfaEnabled: true });
}

export async function logout(): Promise<void> {
  if (state.refreshToken) {
    await api.logout(state.refreshToken).catch(() => undefined);
  }
  clearSession();
}

export { LaandryApiError };
