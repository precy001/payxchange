import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, shadow, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const v = makeVariants(colors)[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        v.container,
        variant === 'primary' && shadow.sm,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} />
      ) : (
        <>
          {icon ? <Ionicons name={icon as any} size={18} color={v.text} style={{ marginRight: spacing.sm }} /> : null}
          <Text style={[styles.label, { color: v.text }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const makeVariants = (colors: Palette): Record<Variant, { container: ViewStyle; text: string; spinner: string }> => ({
  primary: { container: { backgroundColor: colors.primary }, text: colors.white, spinner: colors.white },
  secondary: { container: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line }, text: colors.ink, spinner: colors.ink },
  ghost: { container: { backgroundColor: 'transparent' }, text: colors.primary, spinner: colors.primary },
  danger: { container: { backgroundColor: colors.danger }, text: colors.white, spinner: colors.white },
});

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: font.bold, fontSize: 16 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
});