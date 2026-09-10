'use client';

import { useEffect, useState } from 'react';
import type { Referral } from '@laandry/api-client';
import { REFERRAL_CREDIT_CENTS } from '@laandry/domain';

import adminStyles from '@/components/admin-page.module.css';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/auth-store';

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.adminListReferrals();
        setReferrals(res.referrals);
      } catch {
        setError('Couldn’t load referrals — try refreshing.');
      }
    }
    load();
  }, []);

  const qualified = referrals?.filter((r) => r.status === 'QUALIFIED').length ?? 0;

  return (
    <div>
      <p className={adminStyles.kicker}>Admin · /referrals</p>
      <h1 className={adminStyles.title}>Referrals</h1>
      <p className={adminStyles.description}>
        Every referral link, made at registration. A referral qualifies — and both parties are credited{' '}
        ${(REFERRAL_CREDIT_CENTS / 100).toFixed(2)} each — only once the referee&apos;s first order reaches
        Delivered, never at signup.
        {referrals ? ` ${qualified} of ${referrals.length} qualified so far.` : ''}
      </p>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      {!referrals ? (
        <p className={adminStyles.description}>Loading…</p>
      ) : referrals.length === 0 ? (
        <div className={adminStyles.emptyState}>No referrals yet.</div>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Referrer</th>
                <th>Referee</th>
                <th>Code</th>
                <th>Status</th>
                <th>Qualified</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id}>
                  <td className={adminStyles.mono}>{r.referrerId.slice(0, 8)}…</td>
                  <td className={adminStyles.mono}>{r.refereeId.slice(0, 8)}…</td>
                  <td className={adminStyles.mono}>{r.code}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td className={adminStyles.mono}>{r.qualifiedAt ? new Date(r.qualifiedAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
