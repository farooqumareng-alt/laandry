/**
 * Admin navigation — mirrors the /dashboard…/settings route map and the
 * admin/ops journey in docs/ARCHITECTURE.md §2–§3. Grouped by function so
 * the sidebar reads as an org chart of the marketplace, not an alphabetical
 * dump of 20 links.
 */
export interface NavItem {
  href: string;
  label: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard' }],
  },
  {
    label: 'Operations',
    items: [
      { href: '/orders', label: 'Live Orders' },
      { href: '/customers', label: 'Customers' },
      { href: '/providers', label: 'Providers' },
      { href: '/applications', label: 'Provider Applications' },
      { href: '/service-areas', label: 'Service Areas' },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { href: '/pricing', label: 'Pricing' },
      { href: '/promotions', label: 'Promotions' },
      { href: '/gift-cards', label: 'Gift Cards' },
      { href: '/referrals', label: 'Referrals' },
      { href: '/products', label: 'Products' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/payments', label: 'Payments' },
      { href: '/payouts', label: 'Payouts' },
      { href: '/refunds', label: 'Refunds' },
    ],
  },
  {
    label: 'Trust & Safety',
    items: [
      { href: '/disputes', label: 'Disputes' },
      { href: '/incidents', label: 'Incidents' },
      { href: '/reviews', label: 'Reviews' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/reports', label: 'Reports' },
      { href: '/audit', label: 'Security / Audit' },
      { href: '/settings', label: 'Settings' },
    ],
  },
];
