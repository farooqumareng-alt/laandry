import { PlaceholderPage } from '@/components/placeholder-page';

export default function SettingsPage() {
  return (
    <PlaceholderPage
      kicker="Admin · /settings"
      title="Settings"
      description="Staff accounts and role assignment (docs/ARCHITECTURE.md §5), notification defaults, and system configuration. MFA enforcement for staff/admin lands here in Phase 2."
      emptyState="No settings to configure yet."
    />
  );
}
