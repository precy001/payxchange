import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Linking, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

type Summary = {
  countedToday: number;
  threshold: number;
  perCounterpartyCap: number;
  rewardNaira: number;
  eligible: boolean;
  claimedToday: boolean;
  whatsapp: string;
};

export default function DailyRewardScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();

  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(() => {
    api
      .dailyRewardSummary()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  const openWhatsApp = (number: string, reward: number) => {
    const digits = number.replace(/[^\d]/g, '');
    const text = encodeURIComponent(
      `Hi, I've reached ${data?.threshold} transactions today on PayXchange and would like to claim my ₦${reward.toLocaleString('en-US')} daily reward.`,
    );
    Linking.openURL(`https://wa.me/${digits}?text=${text}`).catch(() =>
      Alert.alert('Could not open WhatsApp', `Please message ${number} to claim.`),
    );
  };

  const claim = async () => {
    if (!data) return;
    setClaiming(true);
    try {
      const res = await api.claimDailyReward();
      openWhatsApp(res.whatsapp, res.rewardNaira);
      load();
    } catch (e) {
      Alert.alert('Could not claim', e instanceof ApiError ? e.message : 'Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const progress = data ? Math.min(1, data.countedToday / data.threshold) : 0;

  return (
    <View style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ width: 26 }}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Daily Reward</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !data ? (
        <View style={styles.center}>
          <Text style={styles.dim}>Couldn't load today's progress.</Text>
          <Pressable onPress={load}>
            <Text style={styles.retry}>Tap to retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}>
          <View style={styles.hero}>
            <Text style={styles.heroReward}>₦{data.rewardNaira.toLocaleString('en-US')}</Text>
            <Text style={styles.heroSub}>
              Make {data.threshold} transactions today to unlock your reward. Resets every day.
            </Text>
          </View>

          {/* Progress */}
          <View style={styles.card}>
            <View style={styles.progressTop}>
              <Text style={styles.progressLabel}>Today's count</Text>
              <Text style={styles.progressCount}>
                {data.countedToday}/{data.threshold}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.bar, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressHint}>
              Transactions with the same person only count up to {data.perCounterpartyCap} times a day.
            </Text>
          </View>

          {/* Claim / status */}
          {data.claimedToday ? (
            <View style={[styles.statusBox, { borderColor: colors.success }]}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.statusText}>Claimed for today — we'll be in touch on WhatsApp.</Text>
            </View>
          ) : data.eligible ? (
            <Pressable style={styles.claim} onPress={claim} disabled={claiming}>
              {claiming ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.claimText}>Claim ₦{data.rewardNaira.toLocaleString('en-US')}</Text>
              )}
            </Pressable>
          ) : (
            <Text style={styles.away}>
              {data.threshold - data.countedToday} more {data.threshold - data.countedToday === 1 ? 'transaction' : 'transactions'} today to unlock.
            </Text>
          )}

          <Text style={styles.fine}>
            Reach {data.threshold} counted transactions any day to unlock a ₦{data.rewardNaira.toLocaleString('en-US')}{' '}
            reward for that day. Everything resets at midnight. Rewards are paid out after verification via
            WhatsApp.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: colors.bgSoft },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
    headerTitle: { fontFamily: font.bold, fontSize: 17, color: colors.ink },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    dim: { fontFamily: font.regular, fontSize: 15, color: colors.muted },
    retry: { fontFamily: font.semibold, fontSize: 15, color: colors.primary },

    hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xl },
    heroReward: { fontFamily: font.extrabold, fontSize: 40, color: colors.white, letterSpacing: -1 },
    heroSub: { fontFamily: font.regular, fontSize: 14, color: colors.white, opacity: 0.9, marginTop: spacing.sm, lineHeight: 20 },

    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg },
    progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    progressLabel: { fontFamily: font.medium, fontSize: 14, color: colors.muted },
    progressCount: { fontFamily: font.extrabold, fontSize: 18, color: colors.ink },
    track: { height: 10, borderRadius: 5, backgroundColor: colors.line, marginTop: spacing.md, overflow: 'hidden' },
    bar: { height: 10, borderRadius: 5, backgroundColor: colors.success },
    progressHint: { fontFamily: font.regular, fontSize: 12.5, color: colors.muted, marginTop: spacing.sm, lineHeight: 18 },

    claim: { backgroundColor: colors.success, height: 54, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
    claimText: { fontFamily: font.bold, fontSize: 16, color: colors.white },
    away: { fontFamily: font.medium, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
    statusBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.xl, backgroundColor: colors.successSoft },
    statusText: { fontFamily: font.medium, fontSize: 14, color: colors.ink, flex: 1 },

    fine: { fontFamily: font.regular, fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: spacing.xl },
  });