import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import Button from '../components/Button';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const phoneOk = /^\+?[1-9]\d{7,14}$/.test(phone.trim());
  const canSubmit = fullName.trim().length >= 2 && phoneOk && !loading;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await api.register({
        phone: phone.trim(),
        fullName: fullName.trim(),
        email: email.trim() || undefined,
      });
      navigation.navigate('Otp', { phone: phone.trim() });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>

        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Takes less than a minute.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Ada Lovelace"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
          />

          <Text style={[styles.label, { marginTop: spacing.lg }]}>Phone number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+2348012345678"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />

          <Text style={[styles.label, { marginTop: spacing.lg }]}>Email (optional)</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            title="Continue"
            onPress={onSubmit}
            loading={loading}
            disabled={!canSubmit}
            style={{ marginTop: spacing.xxl }}
          />

          <Pressable style={styles.footer} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.footerText}>
              Already have an account? <Text style={styles.footerLink}>Log in</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  back: { width: 40, height: 40, justifyContent: 'center', marginBottom: spacing.sm },
  title: { fontFamily: font.extrabold, fontSize: 30, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: font.regular, fontSize: 15, color: colors.muted, marginTop: spacing.xs },
  form: { marginTop: spacing.xl },
  label: { fontFamily: font.semibold, fontSize: 13, color: colors.inkSoft, marginBottom: spacing.sm },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontFamily: font.medium,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.bgSoft,
  },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  errorText: { color: colors.danger, fontFamily: font.medium, fontSize: 13, flex: 1 },
  button: { height: 56, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xxl },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.white, fontFamily: font.bold, fontSize: 16 },
  footer: { alignItems: 'center', marginTop: spacing.xl },
  footerText: { fontFamily: font.regular, fontSize: 14, color: colors.muted },
  footerLink: { fontFamily: font.bold, color: colors.primary },
});