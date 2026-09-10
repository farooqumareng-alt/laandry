import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface ChipGroupProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Single-select chips — used for every enum preference (wash temperature, detergent, drying, fold/hang) so the preferences screen doesn't need a native picker dependency. */
export function ChipGroup<T extends string>({ label, value, options, onChange }: ChipGroupProps<T>) {
  const theme = useTheme();

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.inkSoft, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? 'transparent' : theme.lineStrong,
                backgroundColor: selected ? theme.accent : theme.paperRaised,
              }}
            >
              <Text style={{ color: selected ? theme.accentInk : theme.ink, fontSize: 13.5, fontWeight: '600' }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
