import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Placeholder screen shell used by every route stub in src/app during
 * Phase 1. It exists to prove the route map in docs/ARCHITECTURE.md §2 is
 * fully wired and navigable on native + web before any screen gets real
 * content — swap it out route by route in the phases that build each flow.
 */
export function Screen({
  kicker,
  title,
  description,
  children,
}: PropsWithChildren<{ kicker: string; title: string; description: string }>) {
  const theme = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.paper }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.inner}>
        <Text style={[styles.kicker, { color: theme.brass, fontFamily: Fonts?.mono }]}>
          {kicker}
        </Text>
        <Text style={[styles.title, { color: theme.ink, fontFamily: Fonts?.display }]}>
          {title}
        </Text>
        <Text style={[styles.description, { color: theme.inkSoft, fontFamily: Fonts?.body }]}>
          {description}
        </Text>
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: 24,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: 640,
    paddingVertical: 48,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
});
