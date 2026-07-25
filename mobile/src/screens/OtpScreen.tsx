import React, { useMemo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

export default function OtpScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const phone: string = route.params?.phone;
  const [devCode, setDevCode] = useState<string | undefined>(route.params?.devCode);

  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  const verify = async (value: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.verifyOtp(phone, value);
      navigation.replace('SetPin', { setupToken: res.setupToken });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Verification failed.');
      setCode('');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (code.length === 6 && !loading) verify(code);
  }, [code]);

  // Beta convenience: if the backend handed us the code (no real SMS yet),
  // drop it into the field so testers don't have to hunt for it.
  useEffect(() => {
    if (devCode && devCode.length === 6) setCode(devCode);
  }, [devCode]);

  const resend = async () => {
    try {
      const res = await api.register({ phone });
      if (res?.devCode) setDevCode(res.devCode);
      setResent(true);
      setTimeout(() => setResent(false), 3000);
    } catch {
      // ignore
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
      <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>

      <Text style={styles.title}>Enter the code</Text>
      <Text style={styles.subtitle}>
        We sent a 6-digit code to {phone}.
      </Text>

      {devCode ? (
        <View style={styles.betaBanner}>
          <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
          <Text style={styles.betaText}>Beta — your code is <Text style={styles.betaCode}>{devCode}</Text></Text>
        </View>
      ) : null}

      <Pressable style={styles.cells} onPress={() => inputRef.current?.focus()}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[styles.cell, i === code.length && styles.cellActive]}>
            <Text style={styles.cellText}>{code[i] ?? ''}</Text>
          </View>
        ))}
      </Pressable>

      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        style={styles.hiddenInput}
      />

      <View style={styles.status}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}
      </View>

      <Pressable style={styles.resend} onPress={resend}>
        <Text style={styles.resendText}>{resent ? 'Code resent ✓' : 'Resend code'}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  back: { width: 40, height: 40, justifyContent: 'center', marginBottom: spacing.sm },
  title: { fontFamily: font.extrabold, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: font.regular, fontSize: 15, color: colors.muted, marginTop: spacing.xs, lineHeight: 22 },
  betaBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'flex-start', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  betaText: { fontFamily: font.medium, fontSize: 14, color: colors.ink },
  betaCode: { fontFamily: font.bold, color: colors.primary, letterSpacing: 2 },

  cells: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xxxl, justifyContent: 'space-between' },
  cell: {
    flex: 1,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: { borderColor: colors.primary, backgroundColor: colors.card },
  cellText: { fontFamily: font.extrabold, fontSize: 24, color: colors.ink },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },

  status: { height: 40, justifyContent: 'center', marginTop: spacing.xl },
  error: { color: colors.danger, fontFamily: font.semibold, fontSize: 14 },

  resend: { alignSelf: 'center', marginTop: 'auto', padding: spacing.md },
  resendText: { fontFamily: font.bold, fontSize: 15, color: colors.primary },
});