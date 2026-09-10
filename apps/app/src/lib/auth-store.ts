import { createLaandryClient, LaandryApiError, type AuthUserSummary, type Session } from '@laandry/api-client';

import { secureDelete, secureGet, secureSet } from './secure-storage';

const ACCESS_TOKEN_KEY = 'laandry.accessToken';
const REFRESH_TOKEN_KEY = 'laandry.refreshToken';

// EXPO_PUBLIC_* vars are inlined into the client bundle at build time —
// see apps/app/.env.example. Falls back to the local API dev server so
// `npm run dev:app` works against `npm run dev:api` with zero setup.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: AuthUserSummary | null;
  accessToken: string | null;
  refreshToken: string | null;
}

let state: AuthState = { status: 'loading', user: null, accessToken: null, refreshToken: null };
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

export const api = createLaandryClient({
  baseUrl: API_BASE_URL,
  getAuthToken: () => state.accessToken,
});

async function persistSession(session: Session): Promise<void> {
  await Promise.all([
    secureSet(ACCESS_TOKEN_KEY, session.accessToken),
    secureSet(REFRESH_TOKEN_KEY, session.refreshToken),
  ]);
  setState({
    status: 'signedIn',
    user: session.user,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  });
}

async function clearSession(): Promise<void> {
  await Promise.all([secureDelete(ACCESS_TOKEN_KEY), secureDelete(REFRESH_TOKEN_KEY)]);
  setState({ status: 'signedOut', user: null, accessToken: null, refreshToken: null });
}

/** Called once at app start (see src/app/_layout.tsx). Tries the stored access token, falls back to a refresh, and signs out cleanly if neither works. */
export async function restoreSession(): Promise<void> {
  const [accessToken, refreshToken] = await Promise.all([secureGet(ACCESS_TOKEN_KEY), secureGet(REFRESH_TOKEN_KEY)]);
  if (!accessToken || !refreshToken) {
    setState({ status: 'signedOut' });
    return;
  }

  setState({ accessToken, refreshToken });
  try {
    const user = await api.me();
    setState({ status: 'signedIn', user });
  } catch {
    try {
      const session = await api.refresh(refreshToken);
      await persistSession(session);
    } catch {
      await clearSession();
    }
  }
}

export async function register(email: string, password: string): Promise<void> {
  const session = await api.register({ email, password });
  await persistSession(session);
}

/** Throws LaandryApiError with code "MFA_REQUIRED" if the account needs an mfaCode — catch that and re-call with one. */
export async function login(email: string, password: string, mfaCode?: string): Promise<Session> {
  const session = await api.login({ email, password, mfaCode });
  await persistSession(session);
  return session;
}

export async function applyAsProvider(email: string, password: string): Promise<void> {
  const session = await api.applyAsProvider({ email, password });
  await persistSession(session);
}

export async function logout(): Promise<void> {
  if (state.refreshToken) {
    await api.logout(state.refreshToken).catch(() => undefined);
  }
  await clearSession();
}

export { LaandryApiError };
