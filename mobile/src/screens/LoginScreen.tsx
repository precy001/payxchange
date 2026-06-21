import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import Button from '../components/Button';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { login } = useAuth();

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = phone.trim().length >= 8 && pin.length === 4 && !loading;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await login(phone.trim(), pin);
      // On success the navigator swaps to Home automatically.
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Login failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to your PayXchange account.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Phone number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+2348012345678"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { marginTop: spacing.lg }]}>PIN</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="••••"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            title="Log in"
            onPress={onSubmit}
            loading={loading}
            disabled={!canSubmit}
            style={{ marginTop: spacing.xxl }}
          />

          <Pressable style={styles.footer} onPress={() => navigation.navigate('Register')}>
            <Text style={styles.footerText}>
              New here? <Text style={styles.footerLink}>Create an account</Text>
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
  back: { width: 40, height: 40, justifyContent: 'center', marginBottom: spacing.md },
  title: { fontFamily: font.extrabold, fontSize: 30, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: font.regular, fontSize: 15, color: colors.muted, marginTop: spacing.xs },

  form: { marginTop: spacing.xxl },
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

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  errorText: { color: colors.danger, fontFamily: font.medium, fontSize: 13, flex: 1 },

  button: {
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxl,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.white, fontFamily: font.bold, fontSize: 16 },

  footer: { alignItems: 'center', marginTop: spacing.xl },
  footerText: { fontFamily: font.regular, fontSize: 14, color: colors.muted },
  footerLink: { fontFamily: font.bold, color: colors.primary },
});