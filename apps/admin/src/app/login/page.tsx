'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { LaandryApiError, login } from '@/lib/auth-store';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await login(email.trim(), password, needsMfa ? mfaCode.trim() : undefined);
      router.replace(session.mfaSetupRequired ? '/mfa-setup' : '/dashboard');
    } catch (err) {
      if (err instanceof LaandryApiError) {
        if (err.code === 'MFA_REQUIRED') {
          setNeedsMfa(true);
          setError('Enter the 6-digit code from your authenticator app.');
        } else if (err.code === 'INVALID_CREDENTIALS') {
          setError('That email or password isn’t right.');
        } else {
          setError('Something went wrong. Please try again.');
        }
      } else {
        setError('Couldn’t reach Laandry — check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={onSubmit}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wordmark.svg" alt="Laandry" className={styles.logo} />
        <div>
          <p className={styles.kicker}>Ops Console</p>
          <h1 className={styles.title}>Sign in</h1>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className={styles.input}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {needsMfa ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="mfaCode">
              Authenticator code
            </label>
            <input
              id="mfaCode"
              className={styles.input}
              inputMode="numeric"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
            />
          </div>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}

        <button type="submit" className={styles.button} disabled={submitting || !email || !password}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>

        <p className={styles.hint}>
          Ops, support, dispatch, finance, and admin accounts only — this console never accepts customer or provider
          logins. Staff accounts are provisioned by an existing admin, not self-registered.
        </p>
      </form>
    </div>
  );
}
