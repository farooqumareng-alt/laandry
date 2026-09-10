'use client';

import { useEffect, useState } from 'react';
import type { Promotion } from '@laandry/api-client';
import type { PromotionDiscountType } from '@laandry/domain';

import adminStyles from '@/components/admin-page.module.css';
import { StatusPill } from '@/components/status-pill';
import { api, LaandryApiError } from '@/lib/auth-store';
import styles from './page.module.css';

function discountLabel(p: Promotion): string {
  return p.discountType === 'PERCENTAGE' ? `${p.discountValue}% off` : `$${(p.discountValue / 100).toFixed(2)} off`;
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<PromotionDiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [perCustomerLimit, setPerCustomerLimit] = useState('1');

  async function load() {
    try {
      const res = await api.adminListPromotions();
      setPromotions(res.promotions);
    } catch {
      setError('Couldn’t load promotions — try refreshing.');
    }
  }

  useEffect(() => {
    async function run() {
      await load();
    }
    run();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await api.adminCreatePromotion({
        code,
        discountType,
        discountValue: Number(discountValue),
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
        perCustomerLimit: Number(perCustomerLimit) || 1,
      });
      setCode('');
      setDiscountValue('');
      setMaxRedemptions('');
      setPerCustomerLimit('1');
      await load();
    } catch (err) {
      if (err instanceof LaandryApiError && err.code === 'PROMO_CODE_ALREADY_EXISTS') {
        setError('That code already exists.');
      } else {
        setError('Couldn’t create that promotion — check the values and try again.');
      }
    } finally {
      setCreating(false);
    }
  }

  async function onToggle(promotion: Promotion) {
    setTogglingId(promotion.id);
    try {
      await api.adminSetPromotionActive(promotion.id, !promotion.active);
      await load();
    } catch {
      setError('Couldn’t update that promotion — try again.');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div>
      <p className={adminStyles.kicker}>Admin · /promotions</p>
      <h1 className={adminStyles.title}>Promotions</h1>
      <p className={adminStyles.description}>
        Promo codes applied at booking — a percentage or fixed-amount discount, with an optional redemption cap
        and a per-customer limit (default: once each). Discount amounts here are real once created; there&apos;s
        no placeholder campaign seeded in.
      </p>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      <form className={styles.form} onSubmit={onCreate}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="code">
            Code
          </label>
          <input id="code" className={styles.input} value={code} onChange={(e) => setCode(e.target.value)} required maxLength={20} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="discountType">
            Type
          </label>
          <select
            id="discountType"
            className={styles.select}
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as PromotionDiscountType)}
          >
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED_AMOUNT">Fixed amount</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="discountValue">
            {discountType === 'PERCENTAGE' ? 'Percent off (1-100)' : 'Cents off'}
          </label>
          <input
            id="discountValue"
            className={styles.input}
            type="number"
            min={1}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="maxRedemptions">
            Max redemptions
          </label>
          <input
            id="maxRedemptions"
            className={styles.input}
            type="number"
            min={1}
            placeholder="Unlimited"
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="perCustomerLimit">
            Per-customer limit
          </label>
          <input
            id="perCustomerLimit"
            className={styles.input}
            type="number"
            min={1}
            value={perCustomerLimit}
            onChange={(e) => setPerCustomerLimit(e.target.value)}
          />
        </div>
        <button type="submit" className={adminStyles.actionButton} disabled={creating || !code || !discountValue}>
          {creating ? 'Creating…' : 'Create Code'}
        </button>
      </form>

      {!promotions ? (
        <p className={adminStyles.description}>Loading…</p>
      ) : promotions.length === 0 ? (
        <div className={adminStyles.emptyState}>No promotions yet.</div>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Limits</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => (
                <tr key={p.id}>
                  <td className={adminStyles.mono}>{p.code}</td>
                  <td>{discountLabel(p)}</td>
                  <td>
                    {p.maxRedemptions ?? '∞'} total · {p.perCustomerLimit}/customer
                  </td>
                  <td>
                    <StatusPill status={p.active ? 'ACTIVE' : 'PAUSED'} />
                  </td>
                  <td>
                    <button type="button" className={adminStyles.actionButton} disabled={togglingId === p.id} onClick={() => onToggle(p)}>
                      {togglingId === p.id ? '…' : p.active ? 'Deactivate' : 'Activate'}
                    </button>
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
