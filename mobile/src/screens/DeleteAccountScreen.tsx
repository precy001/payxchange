import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { logout } = useAuth();

  const [confirming, setConfirming] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const press = (k: string) => {
    if (busy) return;
    setError(null);
    if (k === 'del') setPin((p) => p.slice(0, -1));
    else if (k !== '') setPin((p) => (p.length < 4 ? p + k : p));
  };

  useEffect(() => {
    if (pin.length !== 4 || busy) return;
    (async () => {
      setBusy(true);
      try {
        await api.deleteAccount(pin);
        await logout(); // navigator swaps back to Welcome
      } catch (e) {
        const err = e as ApiError;
        setError(err.status === 401 ? 'Incorrect PIN.' : err.message || 'Could not close account.');
        setPin('');
        setBusy(false);
      }
    })();
  }, [pin]);

  if (!confirming) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>

        <View style={styles.warnCenter}>
          <View style={styles.warnBadge}>
            <Ionicons name="warning-outline" size={36} color={colors.danger} />
          </View>
          <Text style={styles.warnTitle}>Delete your account?</Text>
          <Text style={styles.warnBody}>
            Your account will be closed and you'll be signed out. Your past transaction
            records are kept for legal and financial reasons, but you won't be able to log
            in again with this number.
          </Text>
        </View>

        <Pressable style={styles.dangerBtn} onPress={() => setConfirming(true)}>
          <Text style={styles.dangerBtnText}>Continue</Text>
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Keep my account</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg, alignItems: 'center' }]}>
      <Pressable style={[styles.back, { alignSelf: 'flex-start' }]} onPress={() => setConfirming(false)} hitSlop={12}>
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>

      <View style={styles.head}>
        <Text style={styles.title}>Enter your PIN</Text>
        <Text style={styles.subtitle}>to confirm closing your account</Text>
      </View>

      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilledDanger]} />
        ))}
      </View>

      <View style={styles.errSlot}>
        {busy ? <ActivityIndicator color={colors.danger} /> : error ? <Text style={styles.error}>{error}</Text> : null}
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
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  back: { width: 40, height: 40, justifyContent: 'center' },

  warnCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  warnBadge: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#FDECEC', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  warnTitle: { fontFamily: font.extrabold, fontSize: 24, color: colors.ink, marginBottom: spacing.md },
  warnBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center' },

  dangerBtn: { height: 56, borderRadius: radius.lg, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  dangerBtnText: { color: colors.white, fontFamily: font.bold, fontSize: 16 },
  cancelBtn: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  cancelText: { fontFamily: font.semibold, fontSize: 15, color: colors.inkSoft },

  head: { alignItems: 'center', marginTop: spacing.lg },
  title: { fontFamily: font.extrabold, fontSize: 24, color: colors.ink },
  subtitle: { fontFamily: font.regular, fontSize: 14, color: colors.muted, marginTop: spacing.xs },
  dots: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xxxl },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.line },
  dotFilledDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  errSlot: { height: 36, justifyContent: 'center', marginTop: spacing.md },
  error: { color: colors.danger, fontFamily: font.semibold, fontSize: 14, textAlign: 'center' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: KEY_SIZE * 3 + spacing.xl * 2, gap: spacing.xl, marginTop: 'auto' },
  key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { opacity: 0 },
  keyPressed: { backgroundColor: colors.bgSoft },
  keyText: { fontFamily: font.semibold, fontSize: 28, color: colors.ink },
});