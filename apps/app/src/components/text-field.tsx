import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, style, ...props }: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.inkSoft, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.inkFaint}
        style={[
          {
            borderWidth: 1,
            borderColor: error ? theme.danger : theme.line,
            borderRadius: 10,
            paddingVertical: 11,
            paddingHorizontal: 14,
            fontSize: 15,
            color: theme.ink,
            backgroundColor: theme.paperRaised,
          },
          style,
        ]}
        {...props}
      />
      {error ? <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}
