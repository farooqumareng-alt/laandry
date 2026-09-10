import styles from './placeholder-page.module.css';

/**
 * Shell used by every admin route stub during Phase 1 — proves the full
 * §2 route map is wired into the desktop shell before Phase 10 builds real
 * data tables/detail views against the API.
 */
export function PlaceholderPage({
  kicker,
  title,
  description,
  emptyState,
}: {
  kicker: string;
  title: string;
  description: string;
  emptyState?: string;
}) {
  return (
    <div>
      <p className={styles.kicker}>{kicker}</p>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>{description}</p>
      {emptyState ? <div className={styles.emptyState}>{emptyState}</div> : null}
    </div>
  );
}
