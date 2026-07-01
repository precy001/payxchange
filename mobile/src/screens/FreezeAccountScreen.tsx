import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { cache } from '../lib/cache';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function FreezeAccountScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();

  const isFrozen = !!cache.get('me')?.value?.frozen;
  const accent = isFrozen ? colors.success : colors.primary;

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
        if (isFrozen) await api.unfreezeAccount(pin);
        else await api.freezeAccount(pin);
        const cur = cache.get('me')?.value ?? {};
        cache.set('me', { ...cur, frozen: !isFrozen }); // updates Profile/Home
        navigation.goBack();
      } catch (e) {
        const err = e as ApiError;
        setError(err.status === 401 ? 'Incorrect PIN.' : err.message || 'Something went wrong.');
        setPin('');
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  if (!confirming) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>

        <View style={styles.warnCenter}>
          <View style={[styles.badge, { backgroundColor: accent + '22' }]}>
            <Ionicons name={isFrozen ? 'lock-open-outline' : 'snow-outline'} size={36} color={accent} />
          </View>
          <Text style={styles.title}>{isFrozen ? 'Unfreeze your account?' : 'Freeze your account?'}</Text>
          <Text style={styles.body}>
            {isFrozen
              ? 'Payments will be enabled again right away. You can freeze your account whenever you need to.'
              : 'This immediately blocks any payment from your account — useful if your phone is lost or you notice something suspicious. You can unfreeze anytime with your PIN.'}
          </Text>
        </View>

        <Pressable style={[styles.primaryBtn, { backgroundColor: accent }]} onPress={() => setConfirming(true)}>
          <Text style={styles.primaryBtnText}>{isFrozen ? 'Unfreeze account' : 'Freeze account'}</Text>
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
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
        <Text style={styles.subtitle}>to {isFrozen ? 'unfreeze' : 'freeze'} your account</Text>
      </View>

      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && { backgroundColor: accent, borderColor: accent }]} />
        ))}
      </View>

      <View style={styles.errSlot}>
        {busy ? <ActivityIndicator color={accent} /> : error ? <Text style={styles.error}>{error}</Text> : null}
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
    badge: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
    body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center' },

    primaryBtn: { height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { color: colors.white, fontFamily: font.bold, fontSize: 16 },
    cancelBtn: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
    cancelText: { fontFamily: font.semibold, fontSize: 15, color: colors.inkSoft },

    head: { alignItems: 'center', marginTop: spacing.lg },
    title: { fontFamily: font.extrabold, fontSize: 24, color: colors.ink, marginBottom: spacing.md, textAlign: 'center' },
    subtitle: { fontFamily: font.regular, fontSize: 14, color: colors.muted, marginTop: spacing.xs },
    dots: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xxxl },
    dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.line },
    errSlot: { height: 36, justifyContent: 'center', marginTop: spacing.md },
    error: { color: colors.danger, fontFamily: font.semibold, fontSize: 14, textAlign: 'center' },
    pad: { flexDirection: 'row', flexWrap: 'wrap', width: KEY_SIZE * 3 + spacing.xl * 2, gap: spacing.xl, marginTop: 'auto' },
    key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
    keyEmpty: { opacity: 0 },
    keyPressed: { backgroundColor: colors.bgSoft },
    keyText: { fontFamily: font.semibold, fontSize: 28, color: colors.ink },
  });