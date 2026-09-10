'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Order } from '@laandry/api-client';
import { ORDER_STATUSES, type OrderStatus } from '@laandry/domain';

import adminStyles from '@/components/admin-page.module.css';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/auth-store';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setOrders(null);
      try {
        const res = await api.adminListOrders(statusFilter ?? undefined);
        setOrders(res.orders);
      } catch {
        setError('Couldn’t load orders — try refreshing.');
      }
    }
    load();
  }, [statusFilter]);

  return (
    <div>
      <p className={adminStyles.kicker}>Admin · /orders</p>
      <h1 className={adminStyles.title}>Live Orders</h1>
      <p className={adminStyles.description}>Every order, newest first. Filter by status, drill into one for its full detail.</p>

      {error ? <p className={adminStyles.error}>{error}</p> : null}

      <div className={adminStyles.toolbar}>
        <button
          type="button"
          className={`${adminStyles.filterChip} ${statusFilter === null ? adminStyles.filterChipActive : ''}`}
          onClick={() => setStatusFilter(null)}
        >
          All
        </button>
        {ORDER_STATUSES.map((s) => (
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

      {!orders ? (
        <p className={adminStyles.description}>Loading…</p>
      ) : orders.length === 0 ? (
        <div className={adminStyles.emptyState}>No orders match this filter.</div>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Service</th>
                <th>Status</th>
                <th>Pickup window</th>
                <th>Booked</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/orders/${order.id}`} className={adminStyles.link}>
                      {order.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td>{order.service.replace(/_/g, ' ')}</td>
                  <td>
                    <StatusPill status={order.status} />
                  </td>
                  <td className={adminStyles.mono}>{new Date(order.pickupWindowStart).toLocaleString()}</td>
                  <td className={adminStyles.mono}>{new Date(order.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
