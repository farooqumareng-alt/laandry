/**
 * Re-exports the shared design tokens from @laandry/ui in the shape
 * src/hooks/use-theme.ts expects. This file should stay a thin adapter —
 * the tokens themselves live in packages/ui/src/tokens.ts so apps/admin
 * and (eventually) transactional email templates read the same palette.
 */

import '@/global.css';

import { Platform } from 'react-native';
import { color } from '@laandry/ui';

export const Colors = color;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Native custom fonts (Newsreader / Public Sans / IBM Plex Mono, matching
// packages/ui tokens and the marketing site) aren't loaded yet — that's a
// Phase 3 task via expo-font. Until then every platform falls back to its
// system font so nothing renders as tofu.
export const Fonts = Platform.select({
  web: {
    display: 'var(--font-display)',
    body: 'var(--font-body)',
    mono: 'var(--font-mono)',
  },
  ios: {
    display: 'System',
    body: 'System',
    mono: 'Menlo',
  },
  default: {
    display: 'sans-serif',
    body: 'sans-serif',
    mono: 'monospace',
  },
});
