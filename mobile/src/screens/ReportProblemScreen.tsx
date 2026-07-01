import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { formatNaira } from '../lib/money';
import { Txn } from '../components/TransactionRow';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

const REASONS: { key: string; label: string; hint: string }[] = [
  { key: 'unauthorized', label: "I didn't make this payment", hint: 'You don’t recognise this transaction' },
  { key: 'wrong_amount', label: 'Wrong amount charged', hint: 'The amount is different from expected' },
  { key: 'not_received', label: 'Payment not received', hint: 'The other person says they didn’t get it' },
  { key: 'duplicate', label: 'Charged more than once', hint: 'You were billed twice for the same thing' },
  { key: 'other', label: 'Something else', hint: 'Describe the problem below' },
];

export default function ReportProblemScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const txn: Txn = route.params?.txn;

  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      await api.createDispute(txn.id, reason, details.trim() || undefined);
      Alert.alert('Report submitted', 'We’ve received your report and will review it. You can track its status from the transaction.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const err = e as ApiError;
      Alert.alert('Could not submit', err.message || 'Please try again.');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ width: 26 }}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Report a problem</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }} keyboardShouldPersistTaps="handled">
        {txn && (
          <View style={styles.txnCard}>
            <Text style={styles.txnAmount}>
              {txn.direction === 'received' ? '+' : '-'}
              {formatNaira(txn.amountKobo)}
            </Text>
            <Text style={styles.txnMeta} numberOfLines={1}>
              {txn.direction === 'received' ? 'From ' : 'To '}
              {txn.counterparty}
            </Text>
          </View>
        )}

        <Text style={styles.section}>What went wrong?</Text>
        <View style={styles.card}>
          {REASONS.map((r, i) => {
            const selected = reason === r.key;
            return (
              <View key={r.key}>
                {i > 0 && <View style={styles.divider} />}
                <Pressable style={styles.reasonRow} onPress={() => setReason(r.key)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reasonLabel}>{r.label}</Text>
                    <Text style={styles.reasonHint}>{r.hint}</Text>
                  </View>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selected ? colors.primary : colors.line}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>

        <Text style={styles.section}>Add details (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Tell us what happened…"
          placeholderTextColor={colors.muted}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={1000}
        />

        <Pressable
          style={[styles.submit, { backgroundColor: reason ? colors.primary : colors.line }]}
          onPress={submit}
          disabled={!reason || busy}
        >
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitText}>Submit report</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: colors.bgSoft },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
    headerTitle: { fontFamily: font.bold, fontSize: 17, color: colors.ink },

    txnCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, marginBottom: spacing.xl },
    txnAmount: { fontFamily: font.extrabold, fontSize: 22, color: colors.ink },
    txnMeta: { fontFamily: font.regular, fontSize: 14, color: colors.muted, marginTop: 2 },

    section: { fontFamily: font.semibold, fontSize: 13, color: colors.muted, marginBottom: spacing.sm, marginLeft: spacing.xs },
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
    divider: { height: 1, backgroundColor: colors.line },
    reasonRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md },
    reasonLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.ink },
    reasonHint: { fontFamily: font.regular, fontSize: 13, color: colors.muted, marginTop: 2 },

    input: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, minHeight: 100, textAlignVertical: 'top', fontFamily: font.regular, fontSize: 15, color: colors.ink, marginBottom: spacing.xl },

    submit: { height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
    submitText: { fontFamily: font.bold, fontSize: 16, color: colors.white },
  });