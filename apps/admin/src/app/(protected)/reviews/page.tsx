'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Review } from '@laandry/api-client';

import adminStyles from '@/components/admin-page.module.css';
import { api } from '@/lib/auth-store';

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminListReviews()
      .then((res) => setReviews(res.reviews))
      .catch(() => setError('Couldn’t load reviews — try refreshing.'));
  }, []);

  const avg = reviews && reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2) : null;

  return (
    <div>
      <p className={adminStyles.kicker}>Admin · /reviews</p>
      <h1 className={adminStyles.title}>Reviews</h1>
      <p className={adminStyles.description}>
        Customer ratings and comments per completed order.{avg ? ` Average across ${reviews!.length}: ${avg} ★.` : ''}
      </p>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      {!reviews ? (
        <p className={adminStyles.description}>Loading…</p>
      ) : reviews.length === 0 ? (
        <div className={adminStyles.emptyState}>No reviews yet.</div>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Rating</th>
                <th>Comment</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/orders/${r.orderId}`} className={adminStyles.link}>
                      {r.orderId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td>
                    {'★'.repeat(r.rating)}
                    {'☆'.repeat(5 - r.rating)}
                  </td>
                  <td style={{ maxWidth: 360 }}>{r.comment ?? '—'}</td>
                  <td className={adminStyles.mono}>{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
