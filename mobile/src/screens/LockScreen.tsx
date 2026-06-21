import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function LockScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { biometricAvailable, tryBiometricUnlock, unlockWithPin, logout } = useAuth();

  const [usePin, setUsePin] = useState(!biometricAvailable);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-prompt biometric on open.
  useEffect(() => {
    if (biometricAvailable) runBiometric();
  }, []);

  const runBiometric = async () => {
    setError(null);
    try {
      const ok = await tryBiometricUnlock();
      if (!ok) setError('Authentication cancelled.');
    } catch {
      setError('Biometric not available right now.');
    }
  };

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
        await unlockWithPin(pin);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Incorrect PIN.');
        setPin('');
        setBusy(false);
      }
    })();
  }, [pin]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.head}>
        <View style={styles.brandMark}>
          <Ionicons name="lock-closed" size={28} color={colors.white} />
        </View>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>
          {usePin ? 'Enter your PIN to unlock' : 'Unlock PayXchange to continue'}
        </Text>
      </View>

      {!usePin ? (
        <View style={styles.center}>
          <Pressable style={styles.bioBtn} onPress={runBiometric}>
            <Ionicons name="finger-print" size={28} color={colors.primary} />
            <Text style={styles.bioBtnText}>Unlock</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.linkBtn} onPress={() => setUsePin(true)}>
            <Text style={styles.link}>Use PIN instead</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
            ))}
          </View>
          <View style={styles.errSlot}>
            {busy ? <ActivityIndicator color={colors.primary} /> : error ? <Text style={styles.error}>{error}</Text> : null}
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
          {biometricAvailable && (
            <Pressable style={styles.linkBtn} onPress={() => { setUsePin(false); runBiometric(); }}>
              <Text style={styles.link}>Use biometrics</Text>
            </Pressable>
          )}
        </>
      )}

      <Pressable style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Not you? Log out</Text>
      </Pressable>
    </View>
  );
}

const KEY_SIZE = 72;

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl, alignItems: 'center' },
  head: { alignItems: 'center' },
  brandMark: {
    width: 68, height: 68, borderRadius: radius.pill, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  title: { fontFamily: font.extrabold, fontSize: 26, color: colors.ink },
  subtitle: { fontFamily: font.regular, fontSize: 15, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  bioBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    height: 56, paddingHorizontal: spacing.xxl, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.line,
  },
  bioBtnText: { fontFamily: font.bold, fontSize: 16, color: colors.ink },

  dots: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xxxl },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.line },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  errSlot: { height: 36, justifyContent: 'center', marginTop: spacing.md },
  error: { color: colors.danger, fontFamily: font.semibold, fontSize: 14, textAlign: 'center' },

  pad: { flexDirection: 'row', flexWrap: 'wrap', width: KEY_SIZE * 3 + spacing.xl * 2, gap: spacing.xl, marginTop: 'auto' },
  key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { opacity: 0 },
  keyPressed: { backgroundColor: colors.bgSoft },
  keyText: { fontFamily: font.semibold, fontSize: 28, color: colors.ink },

  linkBtn: { padding: spacing.md, marginTop: spacing.md },
  link: { fontFamily: font.bold, fontSize: 15, color: colors.primary },
  logout: { padding: spacing.md, marginTop: spacing.sm },
  logoutText: { fontFamily: font.semibold, fontSize: 14, color: colors.muted },
});