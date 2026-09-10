import styles from './admin-page.module.css';

const ACCENT_STATUSES = new Set(['ACTIVE', 'APPROVED', 'DELIVERED', 'RESOLVED', 'BEING_CARED_FOR', 'FINISHING', 'READY_FOR_RETURN', 'ON_THE_WAY', 'QUALIFIED', 'paid']);
const DANGER_STATUSES = new Set(['SUSPENDED', 'DEACTIVATED', 'DISPUTED', 'DELIVERY_FAILED', 'CANCELLED', 'OPEN']);
const BRASS_STATUSES = new Set(['REVIEW_PENDING', 'IDENTITY_PENDING', 'TRAINING_PENDING', 'APPLICATION_STARTED', 'PAUSED', 'SCHEDULED', 'PROVIDER_ASSIGNED', 'PENDING']);

/** Small, consistent status-to-color mapping reused across every admin table — see admin-page.module.css. `OPEN` reads as danger (needs attention); `RESOLVED` reads as accent (handled) — the opposite of how most other pairs read, deliberately, since an open incident is the thing ops needs to see first. */
export function StatusPill({ status }: { status: string }) {
  const variant = ACCENT_STATUSES.has(status)
    ? styles.pillAccent
    : DANGER_STATUSES.has(status)
      ? styles.pillDanger
      : BRASS_STATUSES.has(status)
        ? styles.pillBrass
        : styles.pillNeutral;
  return <span className={`${styles.pill} ${variant}`}>{status.replace(/_/g, ' ')}</span>;
}
