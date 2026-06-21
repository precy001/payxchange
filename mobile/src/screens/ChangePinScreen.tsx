import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { font, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
type Phase = 'current' | 'new' | 'confirm';

const TITLES: Record<Phase, string> = {
  current: 'Enter current PIN',
  new: 'Choose a new PIN',
  confirm: 'Confirm new PIN',
};

export default function ChangePinScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();

  const [phase, setPhase] = useState<Phase>('current');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
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
    if (pin.length !== 4) return;

    if (phase === 'current') {
      setCurrent(pin);
      setPin('');
      setPhase('new');
      return;
    }
    if (phase === 'new') {
      setNext(pin);
      setPin('');
      setPhase('confirm');
      return;
    }
    if (pin !== next) {
      setError('PINs did not match. Try again.');
      setPin('');
      setNext('');
      setPhase('new');
      return;
    }
    (async () => {
      setBusy(true);
      try {
        await api.changePin(current, next);
        Alert.alert('Done', 'Your PIN has been changed.');
        navigation.goBack();
      } catch (e) {
        const err = e as ApiError;
        setError(err.status === 401 ? 'Current PIN is incorrect.' : err.message || 'Could not change PIN.');
        setPin('');
        setNext('');
        setCurrent('');
        setPhase('current');
        setBusy(false);
      }
    })();
  }, [pin]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
      <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>

      <View style={styles.head}>
        <Text style={styles.title}>{TITLES[phase]}</Text>
        <Text style={styles.subtitle}>4-digit PIN</Text>
      </View>

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
    </View>
  );
}

const KEY_SIZE = 72;
const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl, alignItems: 'center' },
  back: { width: 40, height: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  head: { alignItems: 'center', marginTop: spacing.lg },
  title: { fontFamily: font.extrabold, fontSize: 24, color: colors.ink },
  subtitle: { fontFamily: font.regular, fontSize: 14, color: colors.muted, marginTop: spacing.xs },
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
});