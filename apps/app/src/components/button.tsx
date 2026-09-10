import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
}

/** The one button component every Phase 3 form uses — keeps "Schedule My Laandry"-style CTA styling consistent without duplicating it per screen. */
export function Button({ label, variant = 'primary', loading, disabled, ...props }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const background =
    variant === 'primary' ? theme.accent : variant === 'danger' ? theme.danger : 'transparent';
  const border = variant === 'secondary' ? theme.lineStrong : 'transparent';
  const color = variant === 'secondary' ? theme.ink : theme.accentInk;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={{
        backgroundColor: background,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: border,
        borderRadius: 10,
        paddingVertical: 13,
        paddingHorizontal: 20,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isDisabled ? 0.6 : 1,
      }}
      {...props}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={{ color, fontWeight: '600', fontSize: 15 }}>{label}</Text>}
    </Pressable>
  );
}
