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

const PAID = ['payer_charged', 'payout_pending', 'payout_sent', 'completed'];
const FAILED = ['failed', 'reversed', 'reversing', 'payout_failed'];
// The checkout page redirects here when done (see the provider's callback_url).
// We detect it and confirm — we never actually load this URL.
const RETURN_MARKER = 'payxchange.app/paid';

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

  useEffect(() => {
    setLockSuspended(true);
    const hint = setTimeout(() => setWaited(true), 15000);
    return () => {
      setLockSuspended(false);
      clearTimeout(hint);
    };
  }, []);

  const evaluate = (state: string): boolean => {
    if (PAID.includes(state)) {
      settled.current = true;
      navigation.replace('PaySuccess', { transactionId, amountKobo, payeeName });
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

  // Authoritative confirmation: asks the backend to verify with the provider
  // (charges if paid). Works even if the webhook never arrives.
  const confirm = async (announce: boolean) => {
    if (settled.current) return;
    try {
      const txn = await api.verifyCheckout(transactionId);
      if (!settled.current && !evaluate(txn.state) && announce) {
        Alert.alert(
          'Not confirmed yet',
          'We haven’t confirmed your payment. If you’ve finished paying, wait a moment and tap again.',
        );
      }
    } catch (e) {
      // Fall back to a plain status read (in case the webhook already charged it).
      try {
        const t = await api.getTransaction(transactionId);
        if (!settled.current && !evaluate(t.state) && announce) {
          Alert.alert('Could not confirm', (e as ApiError).message || 'Please try again.');
        }
      } catch {
        if (announce) Alert.alert('Could not confirm', 'Please try again.');
      }
    }
  };

  // Background loop: confirm every few seconds until settled.
  useEffect(() => {
    if (!transactionId) return;
    const timer = setInterval(() => confirm(false), 3000);
    return () => clearInterval(timer);
  }, [transactionId]);

  const onCheck = async () => {
    if (checking || settled.current) return;
    setChecking(true);
    await confirm(true);
    setChecking(false);
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
            // Catch the post-payment redirect: confirm and block the navigation
            // so the WebView never tries to load the marker page.
            onShouldStartLoadWithRequest={(req) => {
              if (req.url && req.url.includes(RETURN_MARKER)) {
                confirm(false);
                return false;
              }
              return true;
            }}
            onNavigationStateChange={(nav) => {
              if (nav.url && nav.url.includes(RETURN_MARKER)) confirm(false);
            }}
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
          <Text style={styles.hint}>Finished paying? Tap below to confirm.</Text>
        )}
        <Pressable style={styles.checkBtn} onPress={onCheck} disabled={checking}>
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