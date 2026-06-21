import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function SetPinScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<any>();
  const { applySession } = useAuth();
  const setupToken: string = route.params?.setupToken;

  const [phase, setPhase] = useState<'create' | 'confirm'>('create');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const press = (k: string) => {
    if (loading) return;
    setError(null);
    if (k === 'del') setPin((p) => p.slice(0, -1));
    else if (k !== '') setPin((p) => (p.length < 4 ? p + k : p));
  };

  useEffect(() => {
    if (pin.length !== 4) return;

    if (phase === 'create') {
      setFirst(pin);
      setPin('');
      setPhase('confirm');
      return;
    }

    // confirm phase
    if (pin !== first) {
      setError('PINs did not match. Start again.');
      setFirst('');
      setPin('');
      setPhase('create');
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const res = await api.setPin(setupToken, pin);
        await applySession({ accessToken: res.accessToken, refreshToken: res.refreshToken });
        // Auth state flips -> navigator swaps to Home automatically.
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not set your PIN.');
        setFirst('');
        setPin('');
        setPhase('create');
        setLoading(false);
      }
    })();
  }, [pin]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.head}>
        <View style={styles.lock}>
          <Ionicons name="lock-closed" size={26} color={colors.primary} />
        </View>
        <Text style={styles.title}>{phase === 'create' ? 'Create a PIN' : 'Confirm your PIN'}</Text>
        <Text style={styles.subtitle}>
          {phase === 'create'
            ? 'You\'ll use this 4-digit PIN to approve payments.'
            : 'Enter it once more to confirm.'}
        </Text>
      </View>

      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>

      <View style={styles.errSlot}>
        {loading ? <ActivityIndicator color={colors.primary} /> : error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.pad}>
        {KEYS.map((k, idx) => (
          <Pressable
            key={idx}
            style={({ pressed }) => [styles.key, k === '' && styles.keyEmpty, pressed && k !== '' && styles.keyPressed]}
            onPress={() => press(k)}
            disabled={k === ''}
          >
            {k === 'del' ? <Ionicons name="backspace-outline" size={26} color={colors.ink} /> : <Text style={styles.keyText}>{k}</Text>}
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
  head: { alignItems: 'center' },
  lock: {
    width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  title: { fontFamily: font.extrabold, fontSize: 26, color: colors.ink },
  subtitle: { fontFamily: font.regular, fontSize: 15, color: colors.muted, marginTop: spacing.xs, textAlign: 'center', maxWidth: 280 },

  dots: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xxxl },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.line },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },

  errSlot: { height: 40, justifyContent: 'center', marginTop: spacing.lg },
  error: { color: colors.danger, fontFamily: font.semibold, fontSize: 14, textAlign: 'center' },

  pad: { flexDirection: 'row', flexWrap: 'wrap', width: KEY_SIZE * 3 + spacing.xl * 2, gap: spacing.xl, marginTop: 'auto' },
  key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { opacity: 0 },
  keyPressed: { backgroundColor: colors.bgSoft },
  keyText: { fontFamily: font.semibold, fontSize: 28, color: colors.ink },
});