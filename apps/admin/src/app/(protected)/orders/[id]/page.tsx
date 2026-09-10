'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type {
  DeliveryVerification,
  Incident,
  Order,
  QuoteResponse,
  Review,
  Tip,
  WeightVerification,
} from '@laandry/api-client';
import { toCustomerMilestone } from '@laandry/domain';

import adminStyles from '@/components/admin-page.module.css';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/auth-store';
import styles from './page.module.css';

function centsToLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The "God view" of one order — docs/ARCHITECTURE.md §3 ("drill into an
 * order's full event history"). Reuses the exact same read endpoints the
 * customer's and provider's own order screens call (GET /orders/:id,
 * weight-verification, incidents, tips, review, delivery-verification) —
 * staff already has an "any"-scoped read grant on all of them, nothing
 * admin-specific needed here. There's no OrderStatusEvent trail to show
 * yet (see §27/§28's note: that table is schema-only, unwired anywhere in
 * this codebase) — a real limitation, not hidden.
 */
export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [weightVerification, setWeightVerification] = useState<WeightVerification | null>(null);
  const [deliveryVerification, setDeliveryVerification] = useState<DeliveryVerification | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  function load() {
    return Promise.all([
      api.getOrder(orderId),
      api.getWeightVerification(orderId),
      api.getDeliveryVerification(orderId),
      api.listIncidents(orderId),
      api.listTips(orderId),
      api.getReview(orderId),
    ])
      .then(([orderRes, weightRes, deliveryRes, incidentsRes, tipsRes, reviewRes]) => {
        setOrder(orderRes.order);
        setQuote(orderRes.quote);
        setWeightVerification(weightRes.weightVerification);
        setDeliveryVerification(deliveryRes.deliveryVerification);
        setIncidents(incidentsRes.incidents);
        setTips(tipsRes.tips);
        setReview(reviewRes.review);
      })
      .catch(() => setError('Couldn’t load this order — it may not exist.'));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function onResolve(incidentId: string) {
    if (!resolutionNote.trim()) return;
    setSubmittingId(incidentId);
    try {
      await api.resolveIncident(orderId, incidentId, resolutionNote.trim());
      setResolutionNote('');
      setExpandedId(null);
      load();
    } catch {
      setError('Couldn’t resolve that incident — try again.');
    } finally {
      setSubmittingId(null);
    }
  }

  if (loading) return <p className={adminStyles.description}>Loading…</p>;
  if (error || !order) return <p className={adminStyles.error}>{error ?? 'Order not found.'}</p>;

  const milestone = toCustomerMilestone(order.status);
  const totalTippedCents = tips.reduce((sum, t) => sum + t.amountCents, 0);

  return (
    <div>
      <Link href="/orders" className={styles.back}>
        ← Live Orders
      </Link>
      <div className={styles.header}>
        <h1 className={adminStyles.title} style={{ marginBottom: 0 }}>
          Order
        </h1>
        <StatusPill status={order.status} />
      </div>
      <p className={styles.id}>{order.id}</p>
      <br />

      <div className={styles.grid}>
        <div>
          <div className={styles.card}>
            <p className={styles.cardTitle}>Summary</p>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Customer</span>
              <span className={adminStyles.mono}>{order.customerId.slice(0, 8)}…</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Service</span>
              <span>{order.service.replace(/_/g, ' ')}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Milestone</span>
              <span>{milestone ?? 'Needs attention'}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Pickup window</span>
              <span>
                {new Date(order.pickupWindowStart).toLocaleString()} – {new Date(order.pickupWindowEnd).toLocaleTimeString()}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Booked</span>
              <span>{new Date(order.createdAt).toLocaleString()}</span>
            </div>
          </div>

          {order.items.length > 0 ? (
            <div className={styles.card}>
              <p className={styles.cardTitle}>Items</p>
              {order.items.map((item, i) => (
                <div className={styles.row} key={i}>
                  <span>{item.description}</span>
                  <span>×{item.quantity}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.card}>
            <p className={styles.cardTitle}>Care preferences</p>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Wash</span>
              <span>{order.preferenceSnapshot.washTemperature === 'warm' ? 'Warm' : 'Cold'}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Detergent</span>
              <span>{order.preferenceSnapshot.detergent}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Drying</span>
              <span>{order.preferenceSnapshot.dryingPreference.replace(/_/g, ' ')}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Finish</span>
              <span>{order.preferenceSnapshot.foldOrHang === 'hang' ? 'Hang' : 'Fold'}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Ironing</span>
              <span>{order.preferenceSnapshot.ironingRequested ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>

        <div>
          {quote ? (
            <div className={styles.card}>
              <p className={styles.cardTitle}>Quote (v{quote.version})</p>
              {quote.lineItems.map((li, i) => (
                <div className={styles.row} key={i}>
                  <span className={styles.rowLabel}>{li.label}</span>
                  <span>{centsToLabel(li.amountCents)}</span>
                </div>
              ))}
              <div className={styles.row} style={{ fontWeight: 700, borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 2 }}>
                <span>Total</span>
                <span>{centsToLabel(quote.totalCents)}</span>
              </div>
            </div>
          ) : null}

          {weightVerification ? (
            <div className={styles.card}>
              <p className={styles.cardTitle}>Weight verification</p>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Verified weight</span>
                <span>{weightVerification.verifiedWeightLb} lb</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Needed approval</span>
                <span>{weightVerification.requiredApproval ? 'Yes' : 'No'}</span>
              </div>
              {weightVerification.requiredApproval ? (
                <div className={styles.row}>
                  <span className={styles.rowLabel}>Customer response</span>
                  <span>
                    {weightVerification.approvedByCustomer === null
                      ? 'Pending'
                      : weightVerification.approvedByCustomer
                        ? 'Approved'
                        : 'Declined'}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {deliveryVerification ? (
            <div className={styles.card}>
              <p className={styles.cardTitle}>Proof of delivery</p>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Method</span>
                <span>{deliveryVerification.method}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Verified at</span>
                <span>{new Date(deliveryVerification.verifiedAt).toLocaleString()}</span>
              </div>
            </div>
          ) : null}

          {tips.length > 0 || review ? (
            <div className={styles.card}>
              <p className={styles.cardTitle}>Tip &amp; review</p>
              {tips.length > 0 ? (
                <div className={styles.row}>
                  <span className={styles.rowLabel}>Total tipped ({tips.length})</span>
                  <span>{centsToLabel(totalTippedCents)}</span>
                </div>
              ) : null}
              {review ? (
                <div className={styles.row}>
                  <span className={styles.rowLabel}>Rating</span>
                  <span>
                    {'★'.repeat(review.rating)}
                    {'☆'.repeat(5 - review.rating)}
                    {review.comment ? ` — “${review.comment}”` : ''}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={styles.card}>
            <p className={styles.cardTitle}>Incidents</p>
            {incidents.length === 0 ? (
              <p className={adminStyles.description} style={{ marginBottom: 0, fontSize: 13 }}>
                None reported.
              </p>
            ) : (
              incidents.map((incident) => (
                <div key={incident.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
                  <div className={styles.row}>
                    <span style={{ fontWeight: 600 }}>{incident.type.replace(/_/g, ' ')}</span>
                    <StatusPill status={incident.status} />
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '4px 0' }}>{incident.description}</p>
                  {incident.status === 'RESOLVED' && incident.resolutionNote ? (
                    <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Resolution: {incident.resolutionNote}</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input
                        placeholder="Resolution note…"
                        value={expandedId === incident.id ? resolutionNote : ''}
                        onFocus={() => setExpandedId(incident.id)}
                        onChange={(e) => {
                          setExpandedId(incident.id);
                          setResolutionNote(e.target.value);
                        }}
                        style={{
                          flex: 1,
                          fontSize: 13,
                          padding: '6px 10px',
                          borderRadius: 7,
                          border: '1px solid var(--line)',
                          background: 'var(--paper-raised)',
                          color: 'var(--ink)',
                        }}
                      />
                      <button
                        type="button"
                        className={adminStyles.actionButton}
                        disabled={expandedId !== incident.id || !resolutionNote.trim() || submittingId === incident.id}
                        onClick={() => onResolve(incident.id)}
                      >
                        {submittingId === incident.id ? '…' : 'Resolve'}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
