import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { formatNaira } from '../lib/money';
import Button from '../components/Button';
import Skeleton from '../components/Skeleton';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

export default function PayConfirmScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const token: string = route.params?.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [card, setCard] = useState<any>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [d, cards] = await Promise.all([api.resolvePaymentRequest(token), api.myCards()]);
        setDetails(d);
        setCard(cards.find((c: any) => c.isDefault) ?? cards[0] ?? null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not read this code.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const addCard = async () => {
    try {
      await api.addMockCard();
      const cards = await api.myCards();
      setCard(cards.find((c: any) => c.isDefault) ?? cards[0] ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add a card.');
    }
  };

  const onPay = async () => {
    if (!card) return;
    setPaying(true);
    setError(null);
    try {
      const txn = await api.initiateTransaction({ token, fundingSourceId: card.id });
      navigation.replace('PayPin', {
        transactionId: txn.id,
        amountKobo: details.amountKobo,
        payeeName: details.payeeName,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start the payment.');
      setPaying(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
      <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <Skeleton width={90} height={14} radius={7} />
          <Skeleton width={170} height={22} radius={8} style={{ marginTop: 14 }} />
          <Skeleton width={210} height={46} radius={12} style={{ marginTop: 22 }} />
          <Skeleton width={150} height={34} radius={17} style={{ marginTop: 20 }} />
        </View>
      ) : error && !details ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
          <Text style={styles.errTitle}>{error}</Text>
          <Button variant="secondary" title="Go back" onPress={() => navigation.goBack()} style={{ paddingHorizontal: spacing.xxl }} />
        </View>
      ) : (
        <>
          <View style={styles.center}>
            <Text style={styles.payingTo}>You're paying</Text>
            <Text style={styles.payee}>{details.payeeName ?? 'PayXchange user'}</Text>
            <Text style={styles.amount}>{formatNaira(details.amountKobo)}</Text>
            <View style={styles.descPill}>
              <Text style={styles.descText}>{details.description}</Text>
            </View>

            <View style={styles.cardRow}>
              <Ionicons name="card-outline" size={18} color={colors.inkSoft} />
              {card ? (
                <Text style={styles.cardText}>
                  {(card.brand ?? 'Card')} •••• {card.last4}
                </Text>
              ) : (
                <Pressable onPress={addCard}>
                  <Text style={styles.addCard}>+ Add a card to pay</Text>
                </Pressable>
              )}
            </View>

            {error ? <Text style={styles.inlineErr}>{error}</Text> : null}
          </View>

          <Button
            title={`Pay ${formatNaira(details.amountKobo)}`}
            onPress={onPay}
            loading={paying}
            disabled={!card}
          />
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  back: { width: 40, height: 40, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  payingTo: { fontFamily: font.regular, fontSize: 15, color: colors.muted },
  payee: { fontFamily: font.bold, fontSize: 20, color: colors.ink, marginTop: spacing.xs, marginBottom: spacing.xl },
  amount: { fontFamily: font.extrabold, fontSize: 48, color: colors.ink, letterSpacing: -1 },
  descPill: {
    backgroundColor: colors.bgSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
  },
  descText: { fontFamily: font.medium, fontSize: 14, color: colors.inkSoft },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xxl },
  cardText: { fontFamily: font.semibold, fontSize: 15, color: colors.inkSoft },
  addCard: { fontFamily: font.bold, fontSize: 15, color: colors.primary },
  inlineErr: { color: colors.danger, fontFamily: font.medium, fontSize: 13, marginTop: spacing.lg },

  errTitle: { fontFamily: font.semibold, fontSize: 16, color: colors.ink, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.xl, maxWidth: 300 },
});