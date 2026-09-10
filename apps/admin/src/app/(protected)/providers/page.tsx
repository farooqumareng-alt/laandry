'use client';

import { useEffect, useState } from 'react';
import type { AdminProviderSummary } from '@laandry/api-client';
import { PROVIDER_STATUSES, type ProviderStatus } from '@laandry/domain';

import adminStyles from '@/components/admin-page.module.css';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/auth-store';

export default function ProvidersPage() {
  const [providers, setProviders] = useState<AdminProviderSummary[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProviderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setProviders(null);
      try {
        const res = await api.adminListProviders(statusFilter ?? undefined);
        setProviders(res.providers);
      } catch {
        setError('Couldn’t load providers — try refreshing.');
      }
    }
    load();
  }, [statusFilter]);

  return (
    <div>
      <p className={adminStyles.kicker}>Admin · /providers</p>
      <h1 className={adminStyles.title}>Providers</h1>
      <p className={adminStyles.description}>
        Every provider profile with its approved service capabilities. See Provider Applications for the
        approval queue.
      </p>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      <div className={adminStyles.toolbar}>
        <button
          type="button"
          className={`${adminStyles.filterChip} ${statusFilter === null ? adminStyles.filterChipActive : ''}`}
          onClick={() => setStatusFilter(null)}
        >
          All
        </button>
        {PROVIDER_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`${adminStyles.filterChip} ${statusFilter === s ? adminStyles.filterChipActive : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {!providers ? (
        <p className={adminStyles.description}>Loading…</p>
      ) : providers.length === 0 ? (
        <div className={adminStyles.emptyState}>No providers match this filter.</div>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id}>
                  <td className={adminStyles.mono}>{p.id.slice(0, 8)}…</td>
                  <td>
                    <StatusPill status={p.status} />
                  </td>
                  <td>{p.services.length > 0 ? p.services.map((s) => s.replace(/_/g, ' ')).join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
