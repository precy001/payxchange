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
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { nairaToKobo } from '../lib/money';
import Button from '../components/Button';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

export default function ReceiveAmountScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [staticLoading, setStaticLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const kobo = nairaToKobo(amount);
  // Description is optional — it shouldn't block someone receiving money.
  const canSubmit = kobo !== null && !loading;

  // A STATIC code carries no amount: the payer scans and types what they want to
  // pay. It's reusable and doesn't expire — print it, stick it on the counter.
  const onGenerateStatic = async () => {
    setError(null);
    setStaticLoading(true);
    try {
      const res = await api.createPaymentRequest({
        type: 'p2p',
        isStatic: true,
        description: description.trim() || undefined,
      });
      navigation.navigate('ReceiveQR', {
        qrImage: res.qrImage,
        amountKobo: res.amountKobo, // null
        description: res.description,
        expiresAt: res.expiresAt,
        isStatic: true,
      });
    } catch (e) {
      if (e instanceof ApiError && e.message === 'ADD_PAYOUT_ACCOUNT') {
        setStaticLoading(false);
        Alert.alert(
          'Add a payout account',
          'Before you can receive money, add the bank account it should be paid into.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Add account', onPress: () => navigation.navigate('PayoutAccount') },
          ],
        );
        return;
      }
      setError(e instanceof ApiError ? e.message : 'Could not create the code.');
    } finally {
      setStaticLoading(false);
    }
  };

  const onGenerate = async () => {
    if (!canSubmit || kobo === null) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.createPaymentRequest({
        type: 'p2p',
        amountKobo: kobo,
        description: description.trim() || undefined,
      });
      navigation.navigate('ReceiveQR', {
        qrImage: res.qrImage,
        amountKobo: res.amountKobo,
        description: res.description,
        expiresAt: res.expiresAt,
        isStatic: false,
      });
    } catch (e) {
      // Backend blocks receiving until a payout account exists.
      if (e instanceof ApiError && e.message === 'ADD_PAYOUT_ACCOUNT') {
        setLoading(false);
        Alert.alert(
          'Add a payout account',
          'Before you can receive money, add the bank account it should be paid into.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Add account', onPress: () => navigation.navigate('PayoutAccount') },
          ],
        );
        return;
      }
      setError(e instanceof ApiError ? e.message : 'Could not create the code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>

        <Text style={styles.title}>Receive money</Text>
        <Text style={styles.subtitle}>Enter an amount and we'll make a QR to scan.</Text>

        <View style={styles.amountBox}>
          <Text style={styles.naira}>₦</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
            placeholder="0"
            placeholderTextColor={colors.line}
            keyboardType="decimal-pad"
            autoFocus
          />
        </View>

        <Text style={styles.label}>What's it for? (optional)</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Groceries, Lunch, Rent"
          placeholderTextColor={colors.muted}
          maxLength={200}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.spacer} />

        <Button title="Generate QR code" onPress={onGenerate} loading={loading} disabled={!canSubmit} />

        <Pressable style={styles.staticBtn} onPress={onGenerateStatic} disabled={staticLoading}>
          {staticLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="infinite-outline" size={18} color={colors.primary} />
              <Text style={styles.staticText}>Generate a static QR (any amount)</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.staticHint}>
          A reusable code with no fixed amount — the payer chooses what to pay. Doesn't expire.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: spacing.xl },
  back: { width: 40, height: 40, justifyContent: 'center', marginBottom: spacing.sm },
  title: { fontFamily: font.extrabold, fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: font.regular, fontSize: 15, color: colors.muted, marginTop: spacing.xs },

  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxxl,
    marginBottom: spacing.xxl,
  },
  naira: { fontFamily: font.bold, fontSize: 36, color: colors.ink, marginRight: spacing.xs },
  amountInput: {
    fontFamily: font.extrabold,
    fontSize: 52,
    color: colors.ink,
    minWidth: 80,
    textAlign: 'center',
    padding: 0,
  },

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
  error: { color: colors.danger, fontFamily: font.medium, fontSize: 13, marginTop: spacing.md },

  staticBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 50, marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary, backgroundColor: 'transparent' },
  staticText: { fontFamily: font.semibold, fontSize: 14, color: colors.primary },
  staticHint: { fontFamily: font.regular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 17 },
  spacer: { flex: 1 },
  button: {
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.white, fontFamily: font.bold, fontSize: 16 },
});