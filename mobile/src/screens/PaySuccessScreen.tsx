import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../lib/api';
import { formatNaira } from '../lib/money';
import Button from '../components/Button';
import { colors, font, radius, spacing } from '../theme';

type Status = 'processing' | 'success' | 'pending' | 'failed';

const DONE = ['completed'];
const FAILED = ['failed', 'reversed', 'reversing', 'payout_failed'];

export default function PaySuccessScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { transactionId, amountKobo, payeeName } = route.params ?? {};

  // Without a txn id (shouldn't happen) fall back to a plain success.
  const [status, setStatus] = useState<Status>(transactionId ? 'processing' : 'success');
  const settled = useRef(false);

  useEffect(() => {
    if (!transactionId) return;
    const timer = setInterval(async () => {
      if (settled.current) return;
      try {
        const txn = await api.getTransaction(transactionId);
        if (DONE.includes(txn.state)) {
          settled.current = true;
          setStatus('success');
        } else if (FAILED.includes(txn.state)) {
          settled.current = true;
          setStatus('failed');
        }
      } catch {
        // keep polling
      }
    }, 2000);
    // If the payout is genuinely slow (parked pending), let the payer leave.
    const slow = setTimeout(() => {
      if (!settled.current) setStatus('pending');
    }, 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(slow);
    };
  }, [transactionId]);

  const goHome = () => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });

  const view = {
    processing: { icon: '', color: colors.primary, title: 'Completing payment…', sub: 'Please hold on a moment' },
    success: { icon: 'checkmark', color: colors.success, title: 'Payment successful', sub: `to ${payeeName ?? 'payee'}` },
    pending: {
      icon: 'time-outline',
      color: colors.warning,
      title: 'Payment processing',
      sub: 'This is taking a little longer than usual. We’ll update your transaction history once it’s done.',
    },
    failed: {
      icon: 'close',
      color: colors.danger,
      title: 'Payment not completed',
      sub: 'The payout could not be completed, so you’ve been refunded.',
    },
  }[status];

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.center}>
        <View style={[styles.halo, { backgroundColor: view.color + '22' }]}>
          <View style={[styles.badge, { backgroundColor: view.color }]}>
            {status === 'processing' ? (
              <ActivityIndicator color={colors.white} size="large" />
            ) : (
              <Ionicons name={view.icon as any} size={56} color={colors.white} />
            )}
          </View>
        </View>
        <Text style={styles.title}>{view.title}</Text>
        {status === 'success' ? <Text style={styles.amount}>{formatNaira(amountKobo ?? 0)}</Text> : null}
        <Text style={styles.to}>{view.sub}</Text>
      </View>

      {status !== 'processing' ? <Button title="Done" onPress={goHome} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  halo: {
    width: 150,
    height: 150,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  badge: {
    width: 110,
    height: 110,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: font.semibold, fontSize: 18, color: colors.ink, textAlign: 'center' },
  amount: { fontFamily: font.extrabold, fontSize: 44, color: colors.ink, letterSpacing: -1, marginTop: spacing.sm },
  to: { fontFamily: font.regular, fontSize: 15, color: colors.inkSoft, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 21 },
});