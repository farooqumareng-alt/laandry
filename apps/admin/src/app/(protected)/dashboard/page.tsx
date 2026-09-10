'use client';

import { useEffect, useState } from 'react';
import type { Incident, Order, AdminProviderSummary, Review } from '@laandry/api-client';
import { ORDER_STATUSES, toCustomerMilestone } from '@laandry/domain';

import adminStyles from '@/components/admin-page.module.css';
import { api } from '@/lib/auth-store';
import styles from './page.module.css';

/**
 * Dashboard — docs/ARCHITECTURE.md §3 ("dashboard of live orders and
 * exceptions at a glance"). No dedicated summary endpoint: the four
 * admin list routes (Phase 10) are small enough at MVP scale to fetch in
 * full and tally client-side, rather than adding a fifth route that just
 * re-derives the same counts server-side.
 */
export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [providers, setProviders] = useState<AdminProviderSummary[] | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.adminListOrders(), api.adminListProviders(), api.adminListIncidents(), api.adminListReviews()])
      .then(([ordersRes, providersRes, incidentsRes, reviewsRes]) => {
        setOrders(ordersRes.orders);
        setProviders(providersRes.providers);
        setIncidents(incidentsRes.incidents);
        setReviews(reviewsRes.reviews);
      })
      .catch(() => setError('Couldn’t load the dashboard — try refreshing.'));
  }, []);

  const loading = !orders || !providers || !incidents || !reviews;

  const activeProviders = providers?.filter((p) => p.status === 'ACTIVE').length ?? 0;
  const pendingApplications = providers?.filter((p) => p.status === 'REVIEW_PENDING').length ?? 0;
  const openIncidents = incidents?.filter((i) => i.status === 'OPEN').length ?? 0;
  const liveOrders = orders?.filter((o) => toCustomerMilestone(o.status) !== null && o.status !== 'DELIVERED').length ?? 0;
  const avgRating =
    reviews && reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : '—';

  return (
    <div>
      <p className={adminStyles.kicker}>Admin · /dashboard</p>
      <h1 className={adminStyles.title}>Dashboard</h1>
      <p className={adminStyles.description}>Live orders and exceptions at a glance — everything else is one click away in the sidebar.</p>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      {loading && !error ? (
        <p className={adminStyles.description}>Loading…</p>
      ) : (
        <>
          <div className={styles.grid}>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Live orders</p>
              <p className={styles.tileValue}>{liveOrders}</p>
            </div>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Active providers</p>
              <p className={styles.tileValue}>{activeProviders}</p>
            </div>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Pending applications</p>
              <p className={styles.tileValue}>{pendingApplications}</p>
            </div>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Open incidents</p>
              <p className={openIncidents > 0 ? `${styles.tileValue} ${styles.tileValueDanger}` : styles.tileValue}>{openIncidents}</p>
            </div>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Avg. rating</p>
              <p className={styles.tileValue}>{avgRating}{reviews && reviews.length > 0 ? ` (${reviews.length})` : ''}</p>
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Orders by status</p>
            {ORDER_STATUSES.filter((s) => orders!.some((o) => o.status === s)).map((s) => (
              <div key={s} className={styles.breakdownRow}>
                <span>{s.replace(/_/g, ' ')}</span>
                <span>{orders!.filter((o) => o.status === s).length}</span>
              </div>
            ))}
            {orders!.length === 0 ? <p className={adminStyles.emptyState}>No orders yet.</p> : null}
          </div>
        </>
      )}
    </div>
  );
}
