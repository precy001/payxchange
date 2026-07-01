import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

// States that mean the payer's payment went through (charge confirmed by the
// webhook). Anything here -> success. 'failed'/'reversed' -> payment failed.
const PAID = ['payer_charged', 'payout_pending', 'payout_sent', 'completed'];
const FAILED = ['failed', 'reversed', 'reversing', 'payout_failed'];

export default function PayCheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { setLockSuspended } = useAuth();
  const { checkoutUrl, transactionId, amountKobo, payeeName } = route.params ?? {};

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [waited, setWaited] = useState(false);
  const settled = useRef(false);

  // Opening a payment page can pop system UI; don't let the lock fire mid-pay.
  useEffect(() => {
    setLockSuspended(true);
    const hint = setTimeout(() => setWaited(true), 20000);
    return () => {
      setLockSuspended(false);
      clearTimeout(hint);
    };
  }, []);

  // Decide based on a fetched transaction. Returns true if we navigated away.
  const evaluate = (state: string): boolean => {
    if (PAID.includes(state)) {
      settled.current = true;
      navigation.replace('PaySuccess', { amountKobo, payeeName });
      return true;
    }
    if (FAILED.includes(state)) {
      settled.current = true;
      Alert.alert('Payment not completed', 'The payment was not successful. You were not charged.', [
        { text: 'OK', onPress: () => navigation.popToTop() },
      ]);
      return true;
    }
    return false;
  };

  // Auto-poll the transaction until the webhook confirms (or fails) the payment.
  useEffect(() => {
    if (!transactionId) return;
    const timer = setInterval(async () => {
      if (settled.current) return;
      try {
        const txn = await api.getTransaction(transactionId);
        if (!settled.current) evaluate(txn.state);
      } catch {
        // transient — keep polling
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [transactionId]);

  // Manual re-check (also surfaces any error so we're never stuck silently).
  const checkNow = async () => {
    if (checking || settled.current) return;
    setChecking(true);
    try {
      const txn = await api.getTransaction(transactionId);
      if (!evaluate(txn.state)) {
        Alert.alert(
          'Not confirmed yet',
          'We haven’t received confirmation of your payment. If you’ve finished paying, give it a few seconds and try again.',
        );
      }
    } catch (e) {
      Alert.alert('Could not check status', (e as ApiError).message || 'Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const cancel = () => {
    Alert.alert('Cancel payment?', 'Your payment is not complete. Leave this screen?', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Cancel payment', style: 'destructive', onPress: () => navigation.popToTop() },
    ]);
  };

  return (
    <View style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={cancel} hitSlop={12} style={{ width: 26 }}>
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Complete payment</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.webWrap}>
        {checkoutUrl ? (
          <WebView
            source={{ uri: checkoutUrl }}
            onLoadEnd={() => setLoading(false)}
            startInLoadingState
            style={{ flex: 1, backgroundColor: colors.bg }}
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.muted}>No checkout link.</Text>
          </View>
        )}
        {loading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {waited && (
          <Text style={styles.hint}>
            Finished paying? Tap below to confirm. (If it never confirms, the payment webhook isn’t reaching the server.)
          </Text>
        )}
        <Pressable style={styles.checkBtn} onPress={checkNow} disabled={checking}>
          {checking ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.checkText}>I’ve completed payment</Text>
          )}
        </Pressable>
        <View style={styles.waitingRow}>
          <ActivityIndicator color={colors.muted} size="small" />
          <Text style={styles.waitingText}>Waiting for confirmation…</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.line },
    headerTitle: { fontFamily: font.bold, fontSize: 17, color: colors.ink },
    webWrap: { flex: 1, position: 'relative' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    muted: { fontFamily: font.regular, color: colors.muted, fontSize: 15 },
    loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
    footer: { paddingTop: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, gap: spacing.sm },
    hint: { fontFamily: font.regular, fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 },
    checkBtn: { height: 50, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    checkText: { fontFamily: font.bold, fontSize: 15, color: colors.white },
    waitingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    waitingText: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  });