import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { gradients, font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();

  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
    >
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        {/* Brand wordmark */}
        <View style={styles.brandRow}>
          <View style={styles.logoMark}>
            <Ionicons name="scan" size={20} color={colors.primary} />
          </View>
          <Text style={styles.wordmark}>PayXchange</Text>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.qrBadge}>
            <Ionicons name="qr-code-outline" size={88} color={colors.white} />
          </View>
          <Text style={styles.headline}>Pay in a{'\n'}single scan.</Text>
          <Text style={styles.sub}>
            Send and receive money instantly. No account numbers, no waiting —
            just scan, confirm, done.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.primaryBtnText}>Get started</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.primary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.6 }]}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.ghostBtnText}>I already have an account</Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  fill: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    color: colors.white,
    fontFamily: font.bold,
    fontSize: 19,
    letterSpacing: 0.2,
  },

  hero: { flex: 1, justifyContent: 'center' },
  qrBadge: {
    width: 132,
    height: 132,
    borderRadius: radius.xl,
    backgroundColor: colors.onBrandGlass,
    borderWidth: 1,
    borderColor: colors.onBrandGlassLine,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  headline: {
    color: colors.white,
    fontFamily: font.extrabold,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.5,
    marginBottom: spacing.lg,
  },
  sub: {
    color: colors.onBrandSoft,
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 320,
  },

  actions: { gap: spacing.md },
  primaryBtn: {
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  primaryBtnText: {
    color: colors.primary,
    fontFamily: font.bold,
    fontSize: 16,
  },
  ghostBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: {
    color: colors.onBrandStrong,
    fontFamily: font.semibold,
    fontSize: 15,
  },
});