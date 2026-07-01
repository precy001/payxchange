import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { formatNaira } from '../lib/money';
import Button from '../components/Button';
import { font, gradients, radius, shadow, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

export default function ReceiveQRScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { qrImage, amountKobo, description } = route.params ?? {};

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
      <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>

      <View style={styles.center}>
        <Text style={styles.amount}>{formatNaira(amountKobo ?? 0)}</Text>
        <Text style={styles.desc}>{description}</Text>

        <View style={styles.qrCard}>
          <View style={styles.brandRow}>
            <Text style={styles.brandMark}>
              Pay<Text style={styles.brandX}>Xchange</Text>
            </Text>
          </View>
          {qrImage ? (
            <View style={styles.qrWrap}>
              <Image source={{ uri: qrImage }} style={styles.qr} resizeMode="contain" />
              <View style={styles.logoBadge}>
                <LinearGradient
                  colors={gradients.brand}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoInner}
                >
                  <Text style={styles.logoText}>PX</Text>
                </LinearGradient>
              </View>
            </View>
          ) : (
            <Text style={styles.muted}>No code</Text>
          )}
        </View>

        <View style={styles.hintRow}>
          <Ionicons name="time-outline" size={16} color={colors.muted} />
          <Text style={styles.hint}>Expires in 10 minutes · single use</Text>
        </View>
        <Text style={styles.scanMe}>Ask the payer to scan this with PayXchange</Text>
      </View>

      <Button title="Done" onPress={() => navigation.popToTop()} />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  back: { width: 40, height: 40, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  amount: { fontFamily: font.extrabold, fontSize: 40, color: colors.ink, letterSpacing: -0.5 },
  desc: { fontFamily: font.regular, fontSize: 15, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.xxl },
  qrCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.card,
  },
  brandRow: { marginBottom: spacing.lg },
  // The card is always true white (for scannability), so these use fixed dark
  // brand colors rather than theme colors.
  brandMark: { fontFamily: font.extrabold, fontSize: 18, color: '#0B1020', letterSpacing: -0.3 },
  brandX: { color: '#4F46E5' },
  qrWrap: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  qr: { position: 'absolute', width: 240, height: 240 },
  logoBadge: {
    padding: 5,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  logoInner: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontFamily: font.extrabold, fontSize: 17, color: '#FFFFFF', letterSpacing: -0.5 },
  muted: { fontFamily: font.regular, color: colors.muted, width: 240, height: 240, textAlign: 'center' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl },
  hint: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  scanMe: { fontFamily: font.regular, fontSize: 13, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },
});