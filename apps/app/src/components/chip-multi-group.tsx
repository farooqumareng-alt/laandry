import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface ChipMultiGroupProps<T extends string> {
  label: string;
  value: T[];
  options: { value: T; label: string }[];
  onChange: (value: T[]) => void;
}

/** Multi-select sibling of ChipGroup — used for provider capabilities, where more than one service can be selected at once. */
export function ChipMultiGroup<T extends string>({ label, value, options, onChange }: ChipMultiGroupProps<T>) {
  const theme = useTheme();

  function toggle(option: T) {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.inkSoft, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const selected = value.includes(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => toggle(option.value)}
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
