'use client';

import { useEffect, useState } from 'react';
import type { AdminProviderSummary } from '@laandry/api-client';
import type { ProviderStatus } from '@laandry/domain';

import adminStyles from '@/components/admin-page.module.css';
import { StatusPill } from '@/components/status-pill';
import { api, LaandryApiError } from '@/lib/auth-store';

// Everything still moving through the pipeline toward ACTIVE — mirrors
// PROVIDER_STATUS_TRANSITIONS in @laandry/domain, where only
// REVIEW_PENDING -> APPROVED is a legal approve() call.
const PIPELINE_STATUSES: ReadonlySet<ProviderStatus> = new Set([
  'APPLICATION_STARTED',
  'IDENTITY_PENDING',
  'REVIEW_PENDING',
  'TRAINING_PENDING',
  'APPROVED',
]);

export default function ApplicationsPage() {
  const [providers, setProviders] = useState<AdminProviderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  function load() {
    return api
      .adminListProviders()
      .then((res) => setProviders(res.providers.filter((p) => PIPELINE_STATUSES.has(p.status))))
      .catch(() => setError('Couldn’t load applications — try refreshing.'));
  }

  useEffect(() => {
    load();
  }, []);

  async function onApprove(providerId: string) {
    setApprovingId(providerId);
    setError(null);
    try {
      await api.adminApproveProvider(providerId);
      await load();
    } catch (err) {
      if (err instanceof LaandryApiError && err.code === 'INVALID_STATUS_FOR_TRANSITION') {
        setError('That application isn’t in review yet — it needs capabilities and a service area submitted first.');
      } else {
        setError('Couldn’t approve that application — try again.');
      }
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div>
      <p className={adminStyles.kicker}>Admin · /applications</p>
      <h1 className={adminStyles.title}>Provider Applications</h1>
      <p className={adminStyles.description}>
        Queue of providers moving through onboarding. Approving hands the application to the provider to add
        availability and go active — capabilities and service area are set by the provider themselves during
        onboarding, not editable here.
      </p>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      {!providers ? (
        <p className={adminStyles.description}>Loading…</p>
      ) : providers.length === 0 ? (
        <div className={adminStyles.emptyState}>No pending applications.</div>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>Capabilities</th>
                <th></th>
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
                  <td>
                    {p.status === 'REVIEW_PENDING' ? (
                      <button
                        type="button"
                        className={adminStyles.actionButton}
                        disabled={approvingId === p.id}
                        onClick={() => onApprove(p.id)}
                      >
                        {approvingId === p.id ? 'Approving…' : 'Approve'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
