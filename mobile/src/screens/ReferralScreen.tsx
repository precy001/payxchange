import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Share, ActivityIndicator, Alert, Linking, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

type Summary = {
  code: string;
  signedUp: number;
  qualified: number;
  threshold: number;
  rewardNaira: number;
  eligible: boolean;
  claimed: boolean;
  whatsapp: string;
};

export default function ReferralScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();

  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(() => {
    api
      .referralSummary()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  const shareCode = async () => {
    if (!data) return;
    await Share.share({
      message: `Join me on PayXchange — scan to pay, straight to your bank. Use my referral code ${data.code} when you sign up. Download: https://payxchange.fly.dev`,
    });
  };

  const copyCode = async () => {
    // Share sheet doubles as copy (its "Copy" action) — avoids a native
    // clipboard dependency so this ships over-the-air.
    if (!data) return;
    await Share.share({ message: data.code });
  };

  const openWhatsApp = (number: string, reward: number) => {
    const digits = number.replace(/[^\d]/g, '');
    const text = encodeURIComponent(
      `Hi, I've reached ${data?.threshold} qualified referrals on PayXchange and would like to claim my ₦${reward.toLocaleString('en-US')} reward. My referral code is ${data?.code}.`,
    );
    Linking.openURL(`https://wa.me/${digits}?text=${text}`).catch(() =>
      Alert.alert('Could not open WhatsApp', `Please message ${number} to claim.`),
    );
  };

  const claim = async () => {
    if (!data) return;
    setClaiming(true);
    try {
      const res = await api.claimReferral();
      openWhatsApp(res.whatsapp, res.rewardNaira);
      load();
    } catch (e) {
      Alert.alert('Could not claim', e instanceof ApiError ? e.message : 'Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const progress = data ? Math.min(1, data.qualified / data.threshold) : 0;

  return (
    <View style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ width: 26 }}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Refer & Earn</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !data ? (
        <View style={styles.center}>
          <Text style={styles.dim}>Couldn't load your referrals.</Text>
          <Pressable onPress={load}>
            <Text style={styles.retry}>Tap to retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}>
          <View style={styles.hero}>
            <Text style={styles.heroReward}>₦{data.rewardNaira.toLocaleString('en-US')}</Text>
            <Text style={styles.heroSub}>
              Refer {data.threshold} people who each register and make a transaction, and unlock your reward.
            </Text>
          </View>

          {/* Code */}
          <Text style={styles.label}>Your referral code</Text>
          <View style={styles.codeRow}>
            <Text style={styles.code}>{data.code}</Text>
            <Pressable onPress={copyCode} hitSlop={8} style={styles.codeBtn}>
              <Ionicons name="copy-outline" size={20} color={colors.primary} />
            </Pressable>
          </View>

          <Pressable style={styles.share} onPress={shareCode}>
            <Ionicons name="share-social-outline" size={18} color={colors.white} />
            <Text style={styles.shareText}>Share your code</Text>
          </Pressable>

          {/* Progress */}
          <View style={styles.card}>
            <View style={styles.progressTop}>
              <Text style={styles.progressLabel}>Qualified referrals</Text>
              <Text style={styles.progressCount}>
                {data.qualified}/{data.threshold}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.bar, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressHint}>
              {data.signedUp} signed up · {data.qualified} have made a transaction
            </Text>
          </View>

          {/* Claim / status */}
          {data.claimed ? (
            <View style={[styles.statusBox, { borderColor: colors.success }]}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.statusText}>Reward claimed — we'll be in touch on WhatsApp.</Text>
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
              {data.threshold - data.qualified} more qualified{' '}
              {data.threshold - data.qualified === 1 ? 'referral' : 'referrals'} to go.
            </Text>
          )}

          <Text style={styles.fine}>
            A referral qualifies once the person registers with your code and completes their first transaction.
            Rewards are paid out after verification via WhatsApp.
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

    label: { fontFamily: font.semibold, fontSize: 13, color: colors.muted, marginBottom: spacing.sm },
    codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.lg, height: 60 },
    code: { fontFamily: font.extrabold, fontSize: 26, color: colors.ink, letterSpacing: 4 },
    codeBtn: { padding: spacing.sm },
    share: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primary, height: 52, borderRadius: radius.lg, marginTop: spacing.md },
    shareText: { fontFamily: font.bold, fontSize: 16, color: colors.white },

    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, marginTop: spacing.xl },
    progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    progressLabel: { fontFamily: font.medium, fontSize: 14, color: colors.muted },
    progressCount: { fontFamily: font.extrabold, fontSize: 18, color: colors.ink },
    track: { height: 10, borderRadius: 5, backgroundColor: colors.line, marginTop: spacing.md, overflow: 'hidden' },
    bar: { height: 10, borderRadius: 5, backgroundColor: colors.success },
    progressHint: { fontFamily: font.regular, fontSize: 12.5, color: colors.muted, marginTop: spacing.sm },

    claim: { backgroundColor: colors.success, height: 54, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
    claimText: { fontFamily: font.bold, fontSize: 16, color: colors.white },
    away: { fontFamily: font.medium, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
    statusBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.xl, backgroundColor: colors.successSoft },
    statusText: { fontFamily: font.medium, fontSize: 14, color: colors.ink, flex: 1 },

    fine: { fontFamily: font.regular, fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: spacing.xl },
  });