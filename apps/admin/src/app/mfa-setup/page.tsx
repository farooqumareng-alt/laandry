'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/hooks/use-auth';
import { api, completeMfaEnrollment, LaandryApiError } from '@/lib/auth-store';
import styles from '../login/page.module.css';

/**
 * Every staff role requires MFA (see @laandry/domain requiresMfa) — a
 * staff account that logs in without one enrolled yet lands here instead
 * of the console (see (protected)/layout.tsx's redirect). Real
 * enrollment: apps/api's /auth/mfa/enroll + /auth/mfa/verify, built in
 * Phase 2 and unused by any frontend until now — no fake "MFA coming
 * soon" placeholder.
 */
export default function MfaSetupPage() {
  const router = useRouter();
  const { status, mfaEnabled } = useAuth();
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (status === 'signedOut') {
      router.replace('/login');
      return;
    }
    if (status === 'signedIn' && mfaEnabled) {
      router.replace('/dashboard');
      return;
    }
    if (status !== 'signedIn') return;

    api
      .mfaEnroll()
      .then((res) => {
        setSecret(res.secret);
        setOtpauthUri(res.otpauthUri);
      })
      .catch(() => setError('Couldn’t start MFA setup — refresh and try again.'))
      .finally(() => setLoadingSecret(false));
  }, [status, mfaEnabled, router]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setVerifying(true);
    try {
      await api.mfaVerify(code.trim());
      await completeMfaEnrollment();
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof LaandryApiError && err.code === 'INVALID_MFA_CODE') {
        setError('That code didn’t match — check the time on your device and try again.');
      } else {
        setError('Couldn’t verify that code — please try again.');
      }
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div>
          <p className={styles.kicker}>Ops Console · required</p>
          <h1 className={styles.title}>Set up two-factor sign-in</h1>
        </div>
        <p className={styles.hint}>
          Every staff account on Laandry requires an authenticator app. Add this account with the key below (Google
          Authenticator, 1Password, Authy — anything that supports TOTP), then enter the 6-digit code it shows.
        </p>

        {loadingSecret ? (
          <p className={styles.hint}>Generating your key…</p>
        ) : secret ? (
          <>
            <div className={styles.field}>
              <span className={styles.label}>Setup key</span>
              <div className={styles.secret}>{secret}</div>
            </div>
            {otpauthUri ? (
              <p className={styles.hint}>
                Or open this URI directly on a device with your authenticator app installed:
                <br />
                <span style={{ wordBreak: 'break-all' }}>{otpauthUri}</span>
              </p>
            ) : null}

            <form className={styles.field} onSubmit={onVerify}>
              <label className={styles.label} htmlFor="code">
                6-digit code
              </label>
              <input
                id="code"
                className={styles.input}
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
              {error ? <p className={styles.error}>{error}</p> : null}
              <button type="submit" className={styles.button} disabled={verifying || code.length !== 6}>
                {verifying ? 'Verifying…' : 'Verify and Continue'}
              </button>
            </form>
          </>
        ) : (
          <p className={styles.error}>{error}</p>
        )}
      </div>
    </div>
  );
}
