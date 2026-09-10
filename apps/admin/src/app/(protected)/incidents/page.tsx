'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Incident } from '@laandry/api-client';
import { INCIDENT_STATUSES, type IncidentStatus } from '@laandry/domain';

import adminStyles from '@/components/admin-page.module.css';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/auth-store';

const TYPE_LABELS: Record<Incident['type'], string> = {
  DAMAGED_ITEM: 'Damaged item',
  MISSING_ITEM: 'Missing item',
  UNSUPPORTED_ITEM: 'Unsupported item',
  OTHER: 'Other',
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | null>('OPEN');
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  async function fetchIncidents() {
    try {
      const res = await api.adminListIncidents(statusFilter ?? undefined);
      setIncidents(res.incidents);
    } catch {
      setError('Couldn’t load incidents — try refreshing.');
    }
  }

  useEffect(() => {
    async function run() {
      setIncidents(null);
      await fetchIncidents();
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function onResolve(orderId: string, incidentId: string) {
    if (!note.trim()) return;
    setSubmittingId(incidentId);
    try {
      await api.resolveIncident(orderId, incidentId, note.trim());
      setNote('');
      setExpandedId(null);
      await fetchIncidents();
    } catch {
      setError('Couldn’t resolve that incident — try again.');
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div>
      <p className={adminStyles.kicker}>Admin · /incidents</p>
      <h1 className={adminStyles.title}>Incidents</h1>
      <p className={adminStyles.description}>
        Damaged, missing, or unsupported-item reports raised by a provider — the pathway that stops a provider
        from being forced to mark everything normal (docs/ARCHITECTURE.md, Incident entity).
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
        {INCIDENT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`${adminStyles.filterChip} ${statusFilter === s ? adminStyles.filterChipActive : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {!incidents ? (
        <p className={adminStyles.description}>Loading…</p>
      ) : incidents.length === 0 ? (
        <div className={adminStyles.emptyState}>No incidents match this filter.</div>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Type</th>
                <th>Description</th>
                <th>Status</th>
                <th>Reported</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <Link href={`/orders/${incident.orderId}`} className={adminStyles.link}>
                      {incident.orderId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td>{TYPE_LABELS[incident.type]}</td>
                  <td style={{ maxWidth: 280 }}>{incident.description}</td>
                  <td>
                    <StatusPill status={incident.status} />
                  </td>
                  <td className={adminStyles.mono}>{new Date(incident.createdAt).toLocaleDateString()}</td>
                  <td>
                    {incident.status === 'OPEN' ? (
                      expandedId === incident.id ? (
                        <div style={{ display: 'flex', gap: 6, minWidth: 200 }}>
                          <input
                            placeholder="Resolution note…"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            autoFocus
                            style={{
                              flex: 1,
                              fontSize: 12.5,
                              padding: '5px 8px',
                              borderRadius: 6,
                              border: '1px solid var(--line)',
                              background: 'var(--paper-raised)',
                              color: 'var(--ink)',
                            }}
                          />
                          <button
                            type="button"
                            className={adminStyles.actionButton}
                            disabled={!note.trim() || submittingId === incident.id}
                            onClick={() => onResolve(incident.orderId, incident.id)}
                          >
                            {submittingId === incident.id ? '…' : 'Save'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={adminStyles.actionButton}
                          onClick={() => {
                            setExpandedId(incident.id);
                            setNote('');
                          }}
                        >
                          Resolve
                        </button>
                      )
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
