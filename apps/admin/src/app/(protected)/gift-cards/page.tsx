'use client';

import { useEffect, useState } from 'react';
import type { GiftCard } from '@laandry/api-client';

import adminStyles from '@/components/admin-page.module.css';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/auth-store';

function centsToLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function GiftCardsPage() {
  const [giftCards, setGiftCards] = useState<GiftCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.adminListGiftCards();
        setGiftCards(res.giftCards);
      } catch {
        setError('Couldn’t load gift cards — try refreshing.');
      }
    }
    load();
  }, []);

  const redeemed = giftCards?.filter((g) => g.status === 'REDEEMED').length ?? 0;
  const totalIssuedCents = giftCards?.reduce((sum, g) => sum + g.valueCents, 0) ?? 0;

  return (
    <div>
      <p className={adminStyles.kicker}>Admin · /gift-cards</p>
      <h1 className={adminStyles.title}>Gift Cards</h1>
      <p className={adminStyles.description}>
        Every gift card purchased. Redeeming one mints a single account-credit grant for its full face
        value — there&apos;s no separate balance ledger here (docs/ARCHITECTURE.md §34).
        {giftCards ? ` ${redeemed} of ${giftCards.length} redeemed, ${centsToLabel(totalIssuedCents)} issued total.` : ''}
      </p>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      {!giftCards ? (
        <p className={adminStyles.description}>Loading…</p>
      ) : giftCards.length === 0 ? (
        <div className={adminStyles.emptyState}>No gift cards yet.</div>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Value</th>
                <th>Purchaser</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Redeemed</th>
              </tr>
            </thead>
            <tbody>
              {giftCards.map((g) => (
                <tr key={g.id}>
                  <td className={adminStyles.mono}>{g.code}</td>
                  <td className={adminStyles.mono}>{centsToLabel(g.valueCents)}</td>
                  <td className={adminStyles.mono}>{g.purchaserId.slice(0, 8)}…</td>
                  <td className={adminStyles.mono}>{g.recipientEmail ?? '—'}</td>
                  <td>
                    <StatusPill status={g.status} />
                  </td>
                  <td className={adminStyles.mono}>{g.redeemedAt ? new Date(g.redeemedAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
