import { Switch, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: theme.ink, fontSize: 15 }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.accent, false: theme.line }}
        thumbColor={theme.paperRaised}
      />
    </View>
  );
}
