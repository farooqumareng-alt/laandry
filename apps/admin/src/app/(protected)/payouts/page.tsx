'use client';

import { useEffect, useState } from 'react';
import type { Payout, ProviderEarning } from '@laandry/api-client';

import adminStyles from '@/components/admin-page.module.css';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/auth-store';
import styles from './page.module.css';

function centsToLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PayoutsPage() {
  const [earnings, setEarnings] = useState<ProviderEarning[] | null>(null);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  async function load() {
    try {
      const [earningsRes, payoutsRes] = await Promise.all([api.adminListEarnings(), api.adminListPayouts()]);
      setEarnings(earningsRes.earnings);
      setPayouts(payoutsRes.payouts);
    } catch {
      setError('Couldn’t load payouts — try refreshing.');
    }
  }

  useEffect(() => {
    async function run() {
      await load();
    }
    run();
  }, []);

  const pendingByProvider = new Map<string, number>();
  for (const e of earnings ?? []) {
    if (e.payoutId) continue;
    pendingByProvider.set(e.providerId, (pendingByProvider.get(e.providerId) ?? 0) + e.amountCents);
  }
  const pendingTotalCents = [...pendingByProvider.values()].reduce((sum, c) => sum + c, 0);

  async function onRun() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await api.adminRunPayouts();
      setRunResult(
        res.providersPaid > 0
          ? `Paid ${res.providersPaid} provider${res.providersPaid === 1 ? '' : 's'}, ${centsToLabel(res.payouts.reduce((s, p) => s + p.amountCents, 0))} total.`
          : 'Nothing pending — every provider is already paid up.',
      );
      await load();
    } catch {
      setError('Couldn’t run payouts — try again.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <p className={adminStyles.kicker}>Admin · /payouts</p>
      <h1 className={adminStyles.title}>Payouts</h1>
      <p className={adminStyles.description}>
        Provider earnings rolled up into a payout batch — 70% of each order&apos;s total plus 100% of tips, per
        provider, per run. No real payout processor is wired up (docs/ARCHITECTURE.md §31) — this moves the
        ledger, not real money.
      </p>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      <div className={styles.runCard}>
        <div>
          <p className={styles.runLabel}>Pending across {pendingByProvider.size} provider{pendingByProvider.size === 1 ? '' : 's'}</p>
          <p className={styles.runAmount}>{centsToLabel(pendingTotalCents)}</p>
        </div>
        <button type="button" className={adminStyles.actionButton} onClick={onRun} disabled={running || pendingTotalCents === 0}>
          {running ? 'Running…' : 'Run Payouts'}
        </button>
      </div>
      {runResult ? <p className={styles.runResult}>{runResult}</p> : null}

      {!payouts ? (
        <p className={adminStyles.description}>Loading…</p>
      ) : payouts.length === 0 ? (
        <div className={adminStyles.emptyState}>No payouts processed yet.</div>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Processed</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td className={adminStyles.mono}>{p.providerId.slice(0, 8)}…</td>
                  <td>{centsToLabel(p.amountCents)}</td>
                  <td>
                    <StatusPill status={p.status} />
                  </td>
                  <td className={adminStyles.mono}>{p.processedAt ? new Date(p.processedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
