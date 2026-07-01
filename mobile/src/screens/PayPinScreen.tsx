import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { formatNaira } from '../lib/money';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function PayPinScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { transactionId, amountKobo, payeeName } = route.params ?? {};

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const press = (k: string) => {
    if (loading) return;
    setError(null);
    if (k === 'del') {
      setPin((p) => p.slice(0, -1));
    } else if (k !== '') {
      setPin((p) => (p.length < 4 ? p + k : p));
    }
  };

  // Auto-submit once 4 digits are entered.
  useEffect(() => {
    if (pin.length !== 4 || loading) return;
    (async () => {
      setLoading(true);
      try {
        const res = await api.confirmTransaction(transactionId, pin);
        // Hosted-checkout providers (Nomba) return a URL to pay on; the charge
        // is confirmed by webhook. Otherwise the charge already happened.
        if (res?.checkoutUrl) {
          navigation.replace('PayCheckout', {
            checkoutUrl: res.checkoutUrl,
            transactionId,
            amountKobo,
            payeeName,
          });
        } else {
          navigation.replace('PaySuccess', { amountKobo, payeeName });
        }
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 423) {
          setError('Account locked. Try again later.');
        } else if (err.status === 401) {
          setError('Incorrect PIN. Try again.');
        } else {
          setError(err.message || 'Payment failed.');
        }
        setPin('');
        setLoading(false);
      }
    })();
  }, [pin]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
      <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>

      <View style={styles.head}>
        <Text style={styles.title}>Enter your PIN</Text>
        <Text style={styles.subtitle}>
          to pay {formatNaira(amountKobo ?? 0)} to {payeeName ?? 'payee'}
        </Text>
      </View>

      {/* Dots */}
      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>

      <View style={styles.errSlot}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}
      </View>

      {/* Keypad */}
      <View style={styles.pad}>
        {KEYS.map((k, idx) => (
          <Pressable
            key={idx}
            style={({ pressed }) => [styles.key, k === '' && styles.keyEmpty, pressed && k !== '' && styles.keyPressed]}
            onPress={() => press(k)}
            disabled={k === ''}
          >
            {k === 'del' ? (
              <Ionicons name="backspace-outline" size={26} color={colors.ink} />
            ) : (
              <Text style={styles.keyText}>{k}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const KEY_SIZE = 72;

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl, alignItems: 'center' },
  back: { width: 40, height: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  head: { alignItems: 'center', marginTop: spacing.lg },
  title: { fontFamily: font.extrabold, fontSize: 26, color: colors.ink },
  subtitle: { fontFamily: font.regular, fontSize: 15, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },

  dots: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xxxl },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.line },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },

  errSlot: { height: 40, justifyContent: 'center', marginTop: spacing.lg },
  error: { color: colors.danger, fontFamily: font.semibold, fontSize: 14 },

  pad: { flexDirection: 'row', flexWrap: 'wrap', width: KEY_SIZE * 3 + spacing.xl * 2, gap: spacing.xl, marginTop: 'auto' },
  key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { opacity: 0 },
  keyPressed: { backgroundColor: colors.bgSoft },
  keyText: { fontFamily: font.semibold, fontSize: 28, color: colors.ink },
});